package exports

import (
	"encoding/csv"
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

func (handler *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if r.Method != http.MethodGet {
		problem(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	actor, err := handler.actor(r)
	if err != nil {
		problem(w, http.StatusForbidden, "Export access denied")
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/exports"), "/")
	if path == "" || path == "resources" {
		resources, err := handler.service.Allowed(actor)
		if err != nil {
			problem(w, statusFor(err), titleFor(err))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"resources": resources})
		return
	}
	result, err := handler.service.Export(r.Context(), actor, Request{Resource: Resource(path)})
	if err != nil {
		problem(w, statusFor(err), titleFor(err))
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename="+result.Filename)
	writer := csv.NewWriter(w)
	_ = writer.Write(result.Header)
	for _, row := range result.Rows {
		cells := make([]string, len(row))
		copy(cells, row)
		_ = writer.Write(cells)
	}
	writer.Flush()
}

func statusFor(err error) int {
	switch {
	case errors.Is(err, ErrForbidden):
		return http.StatusForbidden
	case errors.Is(err, ErrInvalid):
		return http.StatusUnprocessableEntity
	default:
		return http.StatusServiceUnavailable
	}
}

func titleFor(err error) string {
	switch {
	case errors.Is(err, ErrForbidden):
		return "Export access denied"
	case errors.Is(err, ErrInvalid):
		return "Invalid export request"
	default:
		return "Export unavailable"
	}
}

func problem(w http.ResponseWriter, status int, title string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
