package merch

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

// PublicRoutes is the shop surface visitors reach.
func (h *Handler) PublicRoutes() http.Handler {
	router := chi.NewRouter()
	router.Get("/", h.catalogue)
	router.Get("/products/{slug}", h.product)
	router.Post("/checkout", h.checkout)
	return router
}

// AdminRoutes is the staff surface. Reads and writes are protected separately
// by the caller, so this router carries no authorisation of its own.
func (h *Handler) AdminRoutes() http.Handler {
	router := chi.NewRouter()
	router.Get("/products", h.adminProducts)
	router.Put("/products", h.saveProduct)
	router.Put("/variants", h.saveVariant)
	router.Delete("/variants/{id}", h.deleteVariant)
	router.Get("/orders", h.orders)
	return router
}

func (h *Handler) catalogue(w http.ResponseWriter, r *http.Request) {
	products, err := h.service.Catalogue(r.Context())
	if err != nil {
		problem(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"products": products,
		"currency": h.service.Currency(),
		"enabled":  h.service.Enabled(),
	})
}

func (h *Handler) product(w http.ResponseWriter, r *http.Request) {
	product, err := h.service.Product(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		problem(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"product":  product,
		"currency": h.service.Currency(),
		"enabled":  h.service.Enabled(),
	})
}

type checkoutRequest struct {
	Lines []struct {
		VariantID string `json:"variant_id"`
		Quantity  int    `json:"quantity"`
	} `json:"lines"`
	Buyer    Buyer    `json:"buyer"`
	Delivery Delivery `json:"delivery"`
}

func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	var request checkoutRequest
	if !decode(w, r, &request) {
		return
	}
	lines := make([]CartLine, 0, len(request.Lines))
	for _, line := range request.Lines {
		lines = append(lines, CartLine{VariantID: line.VariantID, Quantity: line.Quantity})
	}
	order, checkoutURL, err := h.service.Checkout(r.Context(), CheckoutInput{
		Lines: lines, Buyer: request.Buyer, Delivery: request.Delivery,
	})
	if err != nil {
		problem(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"reference":    order.Reference,
		"total":        order.Total,
		"currency":     order.Currency,
		"checkout_url": checkoutURL,
	})
}

func (h *Handler) adminProducts(w http.ResponseWriter, r *http.Request) {
	products, err := h.service.AdminProducts(r.Context())
	if err != nil {
		problem(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"products": products})
}

func (h *Handler) saveProduct(w http.ResponseWriter, r *http.Request) {
	var product Product
	if !decode(w, r, &product) {
		return
	}
	saved, err := h.service.SaveProduct(r.Context(), product)
	if err != nil {
		problem(w, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (h *Handler) saveVariant(w http.ResponseWriter, r *http.Request) {
	var variant Variant
	if !decode(w, r, &variant) {
		return
	}
	saved, err := h.service.SaveVariant(r.Context(), variant)
	if err != nil {
		problem(w, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (h *Handler) deleteVariant(w http.ResponseWriter, r *http.Request) {
	if err := h.service.DeleteVariant(r.Context(), chi.URLParam(r, "id")); err != nil {
		problem(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) orders(w http.ResponseWriter, r *http.Request) {
	orders, err := h.service.Orders(r.Context(), 50)
	if err != nil {
		problem(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"orders": orders})
}

func decode(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		problem(w, ErrInvalid)
		return false
	}
	if json.Unmarshal(body, target) != nil {
		problem(w, ErrInvalid)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func problem(w http.ResponseWriter, err error) {
	status, title := http.StatusServiceUnavailable, "Merchandise is unavailable"
	switch {
	case errors.Is(err, ErrInvalid):
		status, title = http.StatusUnprocessableEntity, "Invalid merchandise request"
	case errors.Is(err, ErrNotFound):
		status, title = http.StatusNotFound, "Not found"
	case errors.Is(err, ErrOutOfStock):
		status, title = http.StatusConflict, "Out of stock"
	case errors.Is(err, ErrConflict):
		status, title = http.StatusConflict, "Merchandise state conflict"
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
