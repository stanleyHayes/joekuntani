package crm

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
	actor, err := h.actor(r)
	if err != nil {
		problem(w, ErrForbidden)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/crm"), "/")
	parts := split(path)
	if len(parts) == 0 {
		status(w, http.StatusNotFound)
		return
	}
	switch parts[0] {
	case "organizations":
		h.organizations(w, r, actor, parts[1:])
	case "contacts":
		h.contacts(w, r, actor, parts[1:])
	case "enquiries":
		h.enquiries(w, r, actor, parts[1:])
	case "views":
		h.views(w, r, actor, parts[1:])
	default:
		status(w, http.StatusNotFound)
	}
}
func (h *Handler) organizations(w http.ResponseWriter, r *http.Request, a Actor, p []string) {
	if len(p) == 1 && p[0] == "lookup" && r.Method == http.MethodGet {
		v, e := h.service.LookupOrganization(r.Context(), a, r.URL.Query().Get("name"))
		jsonOut(w, http.StatusOK, v, e)
		return
	}
	if len(p) == 0 && r.Method == http.MethodPost {
		var in OrganizationInput
		if !decode(w, r, &in) {
			return
		}
		v, e := h.service.CreateOrganization(r.Context(), a, in)
		jsonOut(w, http.StatusCreated, v, e)
		return
	}
	if len(p) == 1 && r.Method == http.MethodDelete {
		e := h.service.SoftDeleteOrganization(r.Context(), a, p[0])
		jsonOut(w, http.StatusNoContent, nil, e)
		return
	}
	status(w, http.StatusMethodNotAllowed)
}
func (h *Handler) contacts(w http.ResponseWriter, r *http.Request, a Actor, p []string) {
	if len(p) == 0 && r.Method == http.MethodPost {
		var in ContactInput
		if !decode(w, r, &in) {
			return
		}
		v, e := h.service.CreateContact(r.Context(), a, in)
		jsonOut(w, http.StatusCreated, v, e)
		return
	}
	if len(p) == 1 && p[0] == "lookup" && r.Method == http.MethodGet {
		v, e := h.service.LookupContact(r.Context(), a, r.URL.Query().Get("email"), r.URL.Query().Get("phone"))
		jsonOut(w, http.StatusOK, v, e)
		return
	}
	if len(p) == 1 && r.Method == http.MethodDelete {
		e := h.service.SoftDeleteContact(r.Context(), a, p[0])
		jsonOut(w, http.StatusNoContent, nil, e)
		return
	}
	if len(p) == 2 && p[1] == "export" && r.Method == http.MethodGet {
		v, e := h.service.PrivacyExport(r.Context(), a, p[0])
		jsonOut(w, http.StatusOK, v, e)
		return
	}
	if len(p) == 2 && p[1] == "privacy-delete" && r.Method == http.MethodPost {
		v, e := h.service.PrivacyDelete(r.Context(), a, p[0])
		jsonOut(w, http.StatusOK, v, e)
		return
	}
	status(w, http.StatusMethodNotAllowed)
}
func (h *Handler) enquiries(w http.ResponseWriter, r *http.Request, a Actor, p []string) {
	if len(p) == 0 && r.Method == http.MethodGet {
		q := r.URL.Query()
		f := EnquiryFilter{OwnerID: q.Get("owner_id"), Sources: q["source"], ServiceID: q.Get("service_id"), OrganizationID: q.Get("organization_id"), Query: q.Get("q"), IncludeDeleted: q.Get("include_deleted") == "true"}
		for _, v := range q["stage"] {
			f.Stages = append(f.Stages, Stage(v))
		}
		items, e := h.service.ListEnquiries(r.Context(), a, f)
		jsonOut(w, http.StatusOK, map[string]any{"items": items}, e)
		return
	}
	if len(p) == 0 && r.Method == http.MethodPost {
		var in EnquiryInput
		if !decode(w, r, &in) {
			return
		}
		v, e := h.service.CreateEnquiry(r.Context(), a, in)
		jsonOut(w, http.StatusCreated, v, e)
		return
	}
	if len(p) == 1 && r.Method == http.MethodDelete {
		v, e := h.service.SoftDeleteEnquiry(r.Context(), a, p[0])
		jsonOut(w, http.StatusOK, v, e)
		return
	}
	if len(p) == 2 && p[1] == "owner" && r.Method == http.MethodPatch {
		var in struct {
			OwnerID string `json:"owner_id"`
		}
		if !decode(w, r, &in) {
			return
		}
		v, e := h.service.Assign(r.Context(), a, p[0], in.OwnerID)
		jsonOut(w, http.StatusOK, v, e)
		return
	}
	if len(p) == 2 && p[1] == "stage" && r.Method == http.MethodPatch {
		var in struct {
			Stage Stage `json:"stage"`
		}
		if !decode(w, r, &in) {
			return
		}
		v, e := h.service.SetStage(r.Context(), a, p[0], in.Stage)
		jsonOut(w, http.StatusOK, v, e)
		return
	}
	status(w, http.StatusMethodNotAllowed)
}
func (h *Handler) views(w http.ResponseWriter, r *http.Request, a Actor, p []string) {
	if len(p) > 0 {
		status(w, http.StatusNotFound)
		return
	}
	if r.Method == http.MethodGet {
		v, e := h.service.ListViews(r.Context(), a)
		jsonOut(w, http.StatusOK, map[string]any{"items": v}, e)
		return
	}
	if r.Method == http.MethodPost {
		var in struct {
			Name   string        `json:"name"`
			Filter EnquiryFilter `json:"filter"`
		}
		if !decode(w, r, &in) {
			return
		}
		v, e := h.service.SaveView(r.Context(), a, in.Name, in.Filter)
		jsonOut(w, http.StatusCreated, v, e)
		return
	}
	status(w, http.StatusMethodNotAllowed)
}
func decode(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 128<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(target) != nil {
		status(w, http.StatusBadRequest)
		return false
	}
	if err := d.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		status(w, http.StatusBadRequest)
		return false
	}
	return true
}
func jsonOut(w http.ResponseWriter, code int, v any, err error) {
	if err != nil {
		problem(w, err)
		return
	}
	if code == http.StatusNoContent {
		w.WriteHeader(code)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
func problem(w http.ResponseWriter, err error) {
	code := http.StatusInternalServerError
	switch {
	case errors.Is(err, ErrForbidden):
		code = http.StatusForbidden
	case errors.Is(err, ErrInvalid):
		code = http.StatusUnprocessableEntity
	case errors.Is(err, ErrNotFound):
		code = http.StatusNotFound
	case errors.Is(err, ErrConflict), errors.Is(err, ErrRetention):
		code = http.StatusConflict
	}
	status(w, code)
}
func status(w http.ResponseWriter, code int) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": http.StatusText(code), "status": code})
}
func split(v string) []string {
	if v == "" {
		return nil
	}
	raw := strings.Split(v, "/")
	out := raw[:0]
	for _, p := range raw {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
