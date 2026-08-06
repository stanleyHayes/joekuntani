package ticketanalytics

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

type ActorResolver func(*http.Request) (Actor, error)

type Handler struct {
	service *Service
	actor   ActorResolver
}

func NewHandler(service *Service, actor ActorResolver) *Handler {
	return &Handler{service: service, actor: actor}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/ticket-analytics"), "/")
	if path != "" && path != "dashboard" {
		problem(w, http.StatusNotFound, "Ticket analytics route not found")
		return
	}
	if r.Method != http.MethodGet {
		problem(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	actor, err := h.actor(r)
	if err != nil {
		problem(w, http.StatusForbidden, "Ticket analytics access denied")
		return
	}
	dashboard, err := h.service.Dashboard(r.Context(), actor)
	if err != nil {
		problem(w, statusFor(err), titleFor(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(dashboard)
}

func statusFor(err error) int {
	if errors.Is(err, ErrForbidden) {
		return http.StatusForbidden
	}
	return http.StatusServiceUnavailable
}

func titleFor(err error) string {
	if errors.Is(err, ErrForbidden) {
		return "Ticket analytics access denied"
	}
	return "Ticket analytics unavailable"
}

func problem(w http.ResponseWriter, status int, title string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
