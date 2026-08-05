package payments

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

type Handler struct{ service *Service }

func NewHandler(s *Service) *Handler { return &Handler{s} }
func (h *Handler) Checkout(w http.ResponseWriter, r *http.Request) {
	ref := chi.URLParam(r, "reference")
	session, err := h.service.Checkout(r.Context(), ref, r.Header.Get("Order-Access-Key"))
	if err != nil {
		problem(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{"checkout_url": session.URL, "expires_at": session.ExpiresAt})
}
func (h *Handler) Webhook(w http.ResponseWriter, r *http.Request) {
	if !ProviderMatches(chi.URLParam(r, "provider"), h.service.provider.Name()) {
		problem(w, ErrForbidden)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		problem(w, ErrInvalid)
		return
	}
	_, err = h.service.Webhook(r.Context(), r.Header, body)
	if err != nil {
		problem(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func problem(w http.ResponseWriter, err error) {
	status := http.StatusServiceUnavailable
	title := "Payment unavailable"
	switch {
	case errors.Is(err, ErrInvalid):
		status = http.StatusUnprocessableEntity
		title = "Invalid payment request"
	case errors.Is(err, ErrForbidden):
		status = http.StatusUnauthorized
		title = "Payment verification failed"
	case errors.Is(err, ErrConflict):
		status = http.StatusConflict
		title = "Payment state conflict"
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
func ProviderMatches(path, name string) bool { return strings.EqualFold(strings.TrimSpace(path), name) }
