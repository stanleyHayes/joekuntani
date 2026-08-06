package analytics

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
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
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/analytics"), "/")
	switch {
	case path == "overview" && r.Method == http.MethodGet:
		handler.overview(w, r)
	case path == "events" && r.Method == http.MethodPost:
		handler.trackAdmin(w, r)
	default:
		problem(w, http.StatusNotFound, "Analytics route not found")
	}
}

func (handler *Handler) PublicTrack() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != http.MethodPost {
			problem(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
		input, ok := decodeTrack(w, r)
		if !ok {
			return
		}
		if internalOnly[input.Name] {
			problem(w, http.StatusForbidden, "Analytics access denied")
			return
		}
		event, err := handler.service.Track(r.Context(), input)
		if err != nil {
			problem(w, statusFor(err), titleFor(err))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{"id": event.PublicID, "name": event.Name, "occurred_at": event.OccurredAt})
	})
}

func (handler *Handler) overview(w http.ResponseWriter, r *http.Request) {
	actor, err := handler.actor(r)
	if err != nil {
		problem(w, http.StatusForbidden, "Analytics access denied")
		return
	}
	overview, err := handler.service.Overview(r.Context(), actor)
	if err != nil {
		problem(w, statusFor(err), titleFor(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(overview)
}

func (handler *Handler) trackAdmin(w http.ResponseWriter, r *http.Request) {
	actor, err := handler.actor(r)
	if err != nil || !actor.Role.Allows(auth.PermissionAdminAccess) {
		problem(w, http.StatusForbidden, "Analytics access denied")
		return
	}
	input, ok := decodeTrack(w, r)
	if !ok {
		return
	}
	event, err := handler.service.Track(r.Context(), input)
	if err != nil {
		problem(w, statusFor(err), titleFor(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(event)
}

func decodeTrack(w http.ResponseWriter, r *http.Request) (TrackInput, bool) {
	var body struct {
		Name       string            `json:"name"`
		Properties map[string]string `json:"properties"`
		OccurredAt string            `json:"occurred_at"`
	}
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil || decoder.More() {
		problem(w, http.StatusUnprocessableEntity, "Invalid analytics input")
		return TrackInput{}, false
	}
	input := TrackInput{Name: EventName(body.Name), Properties: body.Properties}
	if body.OccurredAt != "" {
		parsed, err := time.Parse(time.RFC3339, body.OccurredAt)
		if err != nil {
			problem(w, http.StatusUnprocessableEntity, "Invalid analytics input")
			return TrackInput{}, false
		}
		input.OccurredAt = parsed
	}
	return input, true
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
		return "Analytics access denied"
	case errors.Is(err, ErrInvalid):
		return "Invalid analytics input"
	default:
		return "Analytics unavailable"
	}
}

func problem(w http.ResponseWriter, status int, title string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
