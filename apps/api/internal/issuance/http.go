package issuance

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	issuer *MongoIssuer
	now    func() time.Time
}

func NewHandler(issuer *MongoIssuer) *Handler { return &Handler{issuer: issuer, now: time.Now} }
func (h *Handler) Confirmation(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("Order-Access-Key")
	if token == "" {
		token = r.URL.Query().Get("access")
	}
	view, err := h.issuer.Confirmation(r.Context(), chi.URLParam(r, "reference"), token, h.now().UTC())
	if err != nil {
		status := http.StatusServiceUnavailable
		if errors.Is(err, ErrInvalid) || errors.Is(err, ErrForbidden) {
			status = http.StatusUnauthorized
		}
		if errors.Is(err, ErrNotReady) {
			status = http.StatusConflict
		}
		w.Header().Set("Content-Type", "application/problem+json")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": "Ticket access unavailable", "status": status})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	_ = json.NewEncoder(w).Encode(view)
}
