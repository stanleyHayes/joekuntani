package crmworkflow

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

type ActorResolver func(*http.Request) (Actor, error)
type Handler struct {
	service *Service
	actor   ActorResolver
}

type DownloadHandler struct {
	signer *AssetSigner
	actor  ActorResolver
}

func NewDownloadHandler(signer *AssetSigner, actor ActorResolver) *DownloadHandler {
	return &DownloadHandler{signer: signer, actor: actor}
}
func (h *DownloadHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	a, err := h.actor(r)
	if err != nil || !a.Allows(PermissionRead) {
		writeProblem(w, ErrForbidden)
		return
	}
	q := r.URL.Query()
	target, err := h.signer.Resolve(r.Context(), q.Get("asset"), q.Get("expires"), q.Get("signature"))
	if err != nil {
		writeProblem(w, err)
		return
	}
	upstreamRequest, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		writeProblem(w, ErrForbidden)
		return
	}
	upstream, err := http.DefaultClient.Do(upstreamRequest)
	if err != nil || upstream.StatusCode < 200 || upstream.StatusCode >= 300 {
		if upstream != nil {
			upstream.Body.Close()
		}
		writeProblem(w, ErrNotFound)
		return
	}
	defer upstream.Body.Close()
	contentType := upstream.Header.Get("Content-Type")
	if contentType != "application/pdf" && contentType != "application/vnd.openxmlformats-officedocument.wordprocessingml.document" {
		writeProblem(w, ErrForbidden)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", "attachment")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, io.LimitReader(upstream.Body, 25<<20))
}

func NewHandler(service *Service, actor ActorResolver) *Handler { return &Handler{service, actor} }
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	a, err := h.actor(r)
	if err != nil {
		writeProblem(w, ErrForbidden)
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/crm/enquiries/"), "/"), "/")
	if len(parts) < 2 {
		writeProblem(w, ErrNotFound)
		return
	}
	enquiry := parts[0]
	switch {
	case len(parts) == 2 && parts[1] == "workflow" && r.Method == http.MethodGet:
		n, t, hist, att, e := h.service.List(r.Context(), a, enquiry)
		writeJSON(w, http.StatusOK, map[string]any{"notes": n, "tasks": t, "stage_history": hist, "attachments": att}, e)
	case len(parts) == 2 && parts[1] == "notes" && r.Method == http.MethodPost:
		var in NoteInput
		if !decodeJSON(w, r, &in) {
			return
		}
		v, e := h.service.AddNote(r.Context(), a, enquiry, in)
		writeJSON(w, http.StatusCreated, v, e)
	case len(parts) == 2 && parts[1] == "tasks" && r.Method == http.MethodPost:
		var in struct {
			Title      string   `json:"title"`
			AssigneeID string   `json:"assignee_id"`
			Priority   Priority `json:"priority"`
			DueAt      string   `json:"due_at"`
		}
		if !decodeJSON(w, r, &in) {
			return
		}
		due, e := time.Parse(time.RFC3339, in.DueAt)
		if e != nil {
			writeProblem(w, ErrInvalid)
			return
		}
		v, e := h.service.AddTask(r.Context(), a, enquiry, TaskInput{in.Title, in.AssigneeID, in.Priority, due})
		writeJSON(w, http.StatusCreated, v, e)
	case len(parts) == 4 && parts[1] == "tasks" && parts[3] == "complete" && r.Method == http.MethodPost:
		v, e := h.service.CompleteTask(r.Context(), a, enquiry, parts[2])
		writeJSON(w, http.StatusOK, v, e)
	case len(parts) == 2 && parts[1] == "attachments" && r.Method == http.MethodPost:
		var in AttachmentInput
		if !decodeJSON(w, r, &in) {
			return
		}
		v, e := h.service.AddAttachment(r.Context(), a, enquiry, in)
		writeJSON(w, http.StatusCreated, v, e)
	case len(parts) == 4 && parts[1] == "attachments" && parts[3] == "access" && r.Method == http.MethodPost:
		v, e := h.service.AttachmentURL(r.Context(), a, enquiry, parts[2])
		writeJSON(w, http.StatusOK, v, e)
	case len(parts) == 2 && parts[1] == "deliveries" && r.Method == http.MethodGet:
		v, e := h.service.Deliveries(r.Context(), a, enquiry)
		writeJSON(w, http.StatusOK, map[string]any{"items": v}, e)
	case len(parts) == 4 && parts[1] == "deliveries" && parts[3] == "retry" && r.Method == http.MethodPost:
		e := h.service.Retry(r.Context(), a, enquiry, parts[2])
		writeJSON(w, http.StatusNoContent, nil, e)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	d := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		writeProblem(w, ErrInvalid)
		return false
	}
	return true
}
func writeJSON(w http.ResponseWriter, status int, v any, err error) {
	if err != nil {
		writeProblem(w, err)
		return
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeProblem(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, ErrForbidden):
		status = http.StatusForbidden
	case errors.Is(err, ErrInvalid):
		status = http.StatusUnprocessableEntity
	case errors.Is(err, ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, ErrConflict):
		status = http.StatusConflict
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": http.StatusText(status), "status": status})
}
