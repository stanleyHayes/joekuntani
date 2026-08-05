package search

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
)

type ActorResolver func(*http.Request) (Actor, error)
type Handler struct {
	service *Service
	actor   ActorResolver
}

func NewHandler(service *Service, actor ActorResolver) *Handler {
	return &Handler{service: service, actor: actor}
}

func (handler *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if r.Method != http.MethodGet {
		problem(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	actor, err := handler.actor(r)
	if err != nil {
		problem(w, http.StatusForbidden, "Search access denied")
		return
	}
	limit := 0
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil {
			problem(w, http.StatusUnprocessableEntity, "Invalid search query")
			return
		}
	}
	response, err := handler.service.Search(r.Context(), actor, Query{Text: r.URL.Query().Get("q"), Limit: limit})
	if err != nil {
		switch {
		case errors.Is(err, ErrForbidden):
			problem(w, http.StatusForbidden, "Search access denied")
		case errors.Is(err, ErrInvalid):
			problem(w, http.StatusUnprocessableEntity, "Invalid search query")
		default:
			problem(w, http.StatusServiceUnavailable, "Search unavailable")
		}
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

func problem(w http.ResponseWriter, status int, title string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
