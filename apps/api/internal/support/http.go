package support

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

// PublicRoutes exposes the visitor-facing donation surface.
func (h *Handler) PublicRoutes() http.Handler {
	router := chi.NewRouter()
	router.Get("/options", h.options)
	router.Post("/checkout", h.checkout)
	return router
}

// AdminRoutes exposes the staff-facing donation ledger.
func (h *Handler) AdminRoutes() http.Handler {
	router := chi.NewRouter()
	router.Get("/", h.list)
	return router
}

// options tells the client which currency and suggested amounts to render, so
// the tiers stay server-owned rather than hard-coded in the browser. `enabled`
// lets the client avoid offering a payment form it cannot complete.
func (h *Handler) options(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":    h.service.Enabled(),
		"currency":   h.service.Currency(),
		"presets":    []string{"20.00", "50.00", "100.00", "250.00"},
		"min_amount": "5.00",
		"max_amount": "50000.00",
	})
}

type checkoutRequest struct {
	Amount    string `json:"amount"`
	Currency  string `json:"currency"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Message   string `json:"message"`
	Anonymous bool   `json:"anonymous"`
}

func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		problem(w, ErrInvalid)
		return
	}
	var request checkoutRequest
	if json.Unmarshal(body, &request) != nil {
		problem(w, ErrInvalid)
		return
	}
	donation, checkoutURL, err := h.service.Create(r.Context(), CreateInput{
		Amount:    request.Amount,
		Currency:  request.Currency,
		Name:      request.Name,
		Email:     request.Email,
		Message:   request.Message,
		Anonymous: request.Anonymous,
	})
	if err != nil {
		problem(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"reference":    donation.Reference,
		"amount":       donation.Amount,
		"currency":     donation.Currency,
		"checkout_url": checkoutURL,
	})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	donations, totals, err := h.service.List(r.Context(), 50)
	if err != nil {
		problem(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"donations": donations, "totals": totals})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func problem(w http.ResponseWriter, err error) {
	status := http.StatusServiceUnavailable
	title := "Donations are unavailable"
	switch {
	case errors.Is(err, ErrInvalid):
		status = http.StatusUnprocessableEntity
		title = "Invalid donation request"
	case errors.Is(err, ErrNotFound):
		status = http.StatusNotFound
		title = "Donation not found"
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
