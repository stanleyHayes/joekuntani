package checkin

import (
	"encoding/json"
	"errors"
	"io"
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
	actor, err := h.actor(r)
	if err != nil || actor.InternalID == "" {
		h.problem(w, ErrForbidden)
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/checkin"), "/")
	parts := strings.Split(path, "/")

	if path == "scan" && r.Method == http.MethodPost {
		var in struct {
			EventID     string `json:"event_id"`
			Token       string `json:"token"`
			DeviceLabel string `json:"device_label"`
		}
		if !decode(w, r, &in) {
			return
		}
		result, err := h.service.Scan(r.Context(), actor, ScanInput{EventID: in.EventID, Token: in.Token, DeviceLabel: in.DeviceLabel})
		if err != nil {
			if errors.Is(err, ErrConflict) || result.Result == ResultAlreadyCheckedIn {
				h.json(w, http.StatusConflict, result)
				return
			}
			h.problem(w, err)
			return
		}
		if result.Result == ResultAlreadyCheckedIn {
			h.json(w, http.StatusConflict, result)
			return
		}
		h.json(w, http.StatusOK, result)
		return
	}

	if len(parts) == 3 && parts[0] == "events" && parts[2] == "count" && r.Method == http.MethodGet {
		count, err := h.service.Count(r.Context(), actor, parts[1])
		if err != nil {
			h.problem(w, err)
			return
		}
		h.json(w, http.StatusOK, count)
		return
	}

	w.WriteHeader(http.StatusNotFound)
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(v); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		w.WriteHeader(http.StatusBadRequest)
		return false
	}
	return true
}

func (h *Handler) json(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (*Handler) problem(w http.ResponseWriter, err error) {
	status := http.StatusServiceUnavailable
	switch {
	case errors.Is(err, ErrInvalid):
		status = http.StatusUnprocessableEntity
	case errors.Is(err, ErrForbidden):
		status = http.StatusForbidden
	case errors.Is(err, ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, ErrConflict):
		status = http.StatusConflict
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": http.StatusText(status), "status": status})
}
