package campaigns

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
	if err != nil {
		campaignProblem(w, ErrForbidden)
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/campaigns"), "/")
	parts := []string{}
	if path != "" {
		parts = strings.Split(path, "/")
	}
	if len(parts) == 0 {
		h.collection(w, r, actor)
		return
	}
	id := parts[0]
	if len(parts) == 1 {
		h.item(w, r, actor, id)
		return
	}
	if len(parts) == 2 && parts[1] == "deliverables" {
		if r.Method == http.MethodGet {
			item, values, e := h.service.Detail(r.Context(), actor, id)
			campaignJSON(w, http.StatusOK, map[string]any{"campaign": item, "items": values}, e)
			return
		}
		if r.Method == http.MethodPost {
			var in DeliverableInput
			if !campaignDecode(w, r, &in) {
				return
			}
			value, e := h.service.AddDeliverable(r.Context(), actor, id, in)
			campaignJSON(w, http.StatusCreated, value, e)
			return
		}
	}
	if len(parts) == 3 && parts[1] == "deliverables" && r.Method == http.MethodPatch {
		var in DeliverableInput
		if !campaignDecode(w, r, &in) {
			return
		}
		value, e := h.service.UpdateDeliverable(r.Context(), actor, id, parts[2], in)
		campaignJSON(w, http.StatusOK, value, e)
		return
	}
	http.Error(w, "not found", http.StatusNotFound)
}
func (h *Handler) collection(w http.ResponseWriter, r *http.Request, a Actor) {
	if r.Method == http.MethodGet {
		q := r.URL.Query()
		items, e := h.service.List(r.Context(), a, Filter{Status: Status(q.Get("status")), OrganizationID: q.Get("organization_id"), Platform: q.Get("platform"), IncludeDeleted: q.Get("include_deleted") == "true"})
		campaignJSON(w, http.StatusOK, map[string]any{"items": items}, e)
		return
	}
	if r.Method == http.MethodPost {
		var in Input
		if !campaignDecode(w, r, &in) {
			return
		}
		item, e := h.service.Create(r.Context(), a, in)
		campaignJSON(w, http.StatusCreated, item, e)
		return
	}
	w.WriteHeader(http.StatusMethodNotAllowed)
}
func (h *Handler) item(w http.ResponseWriter, r *http.Request, a Actor, id string) {
	if r.Method == http.MethodGet {
		item, deliverables, e := h.service.Detail(r.Context(), a, id)
		campaignJSON(w, http.StatusOK, map[string]any{"campaign": item, "deliverables": deliverables}, e)
		return
	}
	if r.Method == http.MethodPatch {
		var in Input
		if !campaignDecode(w, r, &in) {
			return
		}
		item, e := h.service.Update(r.Context(), a, id, in)
		campaignJSON(w, http.StatusOK, item, e)
		return
	}
	if r.Method == http.MethodDelete {
		e := h.service.Delete(r.Context(), a, id)
		campaignJSON(w, http.StatusNoContent, nil, e)
		return
	}
	w.WriteHeader(http.StatusMethodNotAllowed)
}
func campaignDecode(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 256<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(target) != nil {
		campaignProblem(w, ErrInvalid)
		return false
	}
	var extra any
	if err := d.Decode(&extra); !errors.Is(err, io.EOF) {
		campaignProblem(w, ErrInvalid)
		return false
	}
	return true
}
func campaignJSON(w http.ResponseWriter, status int, value any, err error) {
	if err != nil {
		campaignProblem(w, err)
		return
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func campaignProblem(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	title := "Campaign operation failed"
	switch {
	case errors.Is(err, ErrInvalid):
		status = http.StatusUnprocessableEntity
		title = "Invalid campaign"
	case errors.Is(err, ErrForbidden):
		status = http.StatusForbidden
		title = "Access denied"
	case errors.Is(err, ErrNotFound):
		status = http.StatusNotFound
		title = "Campaign not found"
	case errors.Is(err, ErrConflict):
		status = http.StatusConflict
		title = "Campaign conflict"
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
