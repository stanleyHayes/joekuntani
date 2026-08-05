package ticketing

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

type HTTPHandler struct{ service *Service }

func NewHTTPHandler(service *Service) *HTTPHandler { return &HTTPHandler{service: service} }
func (h *HTTPHandler) CreateHandler() http.Handler { return http.HandlerFunc(h.create) }
func (h *HTTPHandler) create(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeProblem(w, http.StatusUnsupportedMediaType)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input CreateInput
	if decoder.Decode(&input) != nil || decoder.Decode(&struct{}{}) == nil {
		writeProblem(w, http.StatusBadRequest)
		return
	}
	input.IdempotencyKey = r.Header.Get("Idempotency-Key")
	receipt, err := h.service.Create(r.Context(), input)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalid):
			writeProblem(w, http.StatusUnprocessableEntity)
		case errors.Is(err, ErrConflict):
			writeProblem(w, http.StatusConflict)
		default:
			writeProblem(w, http.StatusServiceUnavailable)
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(receipt)
}
func writeProblem(w http.ResponseWriter, status int) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": "Unable to create ticket order", "status": status})
}
