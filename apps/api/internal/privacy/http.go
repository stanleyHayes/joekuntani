package privacy

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
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
	actor, err := handler.actor(r)
	if err != nil {
		problem(w, ErrForbidden)
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/privacy"), "/")
	parts := split(path)
	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		status, err := handler.service.Status(r.Context(), actor)
		writeJSON(w, http.StatusOK, status, err)
	case len(parts) == 1 && parts[0] == "holds" && r.Method == http.MethodGet:
		holds, err := handler.service.ListHolds(r.Context(), actor)
		writeJSON(w, http.StatusOK, map[string]any{"items": holds}, err)
	case len(parts) == 1 && parts[0] == "holds" && r.Method == http.MethodPost:
		var input HoldInput
		if !decodeExact(w, r, &input) {
			return
		}
		hold, err := handler.service.PlaceHold(r.Context(), actor, input)
		writeJSON(w, http.StatusCreated, hold, err)
	case len(parts) == 2 && parts[0] == "holds" && r.Method == http.MethodDelete:
		hold, err := handler.service.ClearHold(r.Context(), actor, parts[1])
		writeJSON(w, http.StatusOK, hold, err)
	case len(parts) == 1 && parts[0] == "retention" && r.Method == http.MethodPost:
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		result, err := handler.service.RunRetention(r.Context(), actor, limit)
		writeJSON(w, http.StatusOK, result, err)
	default:
		problem(w, ErrInvalid)
	}
}

func decodeExact(w http.ResponseWriter, r *http.Request, target any) bool {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		problem(w, ErrInvalid)
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		problem(w, ErrInvalid)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, code int, value any, err error) {
	if err != nil {
		problem(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(value)
}

func problem(w http.ResponseWriter, err error) {
	code := http.StatusServiceUnavailable
	title := "Privacy unavailable"
	switch {
	case errors.Is(err, ErrForbidden):
		code, title = http.StatusForbidden, "Privacy access denied"
	case errors.Is(err, ErrInvalid):
		code, title = http.StatusUnprocessableEntity, "Invalid privacy request"
	case errors.Is(err, ErrNotFound):
		code, title = http.StatusNotFound, "Privacy record not found"
	case errors.Is(err, ErrConflict), errors.Is(err, ErrRetention):
		code, title = http.StatusConflict, "Privacy conflict"
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": title, "status": code})
}

func split(path string) []string {
	if path == "" {
		return nil
	}
	raw := strings.Split(path, "/")
	out := raw[:0]
	for _, part := range raw {
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}
