package bookings

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type ActorResolver func(*http.Request) (Actor, error)
type Handler struct {
	service *Service
	actor   ActorResolver
}

func NewHandler(service *Service, actor ActorResolver) *Handler {
	return &Handler{service: service, actor: actor}
}
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/", h.list)
	r.Post("/", h.create)
	r.Get("/calendar.ics", h.ical)
	r.Patch("/{id}", h.update)
	r.Delete("/{id}", h.delete)
	return r
}
func (h *Handler) filter(r *http.Request) (Filter, error) {
	from, e1 := time.Parse(time.RFC3339, r.URL.Query().Get("from"))
	to, e2 := time.Parse(time.RFC3339, r.URL.Query().Get("to"))
	status := Status(r.URL.Query().Get("status"))
	if e1 != nil || e2 != nil || (status != "" && status != Tentative && status != Confirmed && status != Cancelled) {
		return Filter{}, ErrInvalid
	}
	return Filter{From: from, To: to, Status: status}, nil
}
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	a, e := h.actor(r)
	if e != nil {
		problem(w, ErrForbidden)
		return
	}
	f, e := h.filter(r)
	if e != nil {
		problem(w, e)
		return
	}
	v, e := h.service.List(r.Context(), a, f)
	out(w, http.StatusOK, v, e)
}
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	a, e := h.actor(r)
	if e != nil {
		problem(w, ErrForbidden)
		return
	}
	var in Input
	if !decode(w, r, &in) {
		return
	}
	v, e := h.service.Create(r.Context(), a, in)
	out(w, http.StatusCreated, v, e)
}
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	a, e := h.actor(r)
	if e != nil {
		problem(w, ErrForbidden)
		return
	}
	var in Input
	if !decode(w, r, &in) {
		return
	}
	v, e := h.service.Update(r.Context(), a, chi.URLParam(r, "id"), in)
	out(w, http.StatusOK, v, e)
}
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	a, e := h.actor(r)
	if e != nil {
		problem(w, ErrForbidden)
		return
	}
	version, e := strconv.ParseInt(r.URL.Query().Get("version"), 10, 64)
	if e != nil {
		problem(w, ErrInvalid)
		return
	}
	e = h.service.Delete(r.Context(), a, chi.URLParam(r, "id"), version)
	out(w, http.StatusNoContent, nil, e)
}
func (h *Handler) ical(w http.ResponseWriter, r *http.Request) {
	a, e := h.actor(r)
	if e != nil {
		problem(w, ErrForbidden)
		return
	}
	f, e := h.filter(r)
	if e != nil {
		problem(w, e)
		return
	}
	v, e := h.service.ICal(r.Context(), a, f)
	if e != nil {
		problem(w, e)
		return
	}
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="bookings.ics"`)
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = w.Write([]byte(v))
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		problem(w, ErrInvalid)
		return false
	}
	var trailing any
	if err := d.Decode(&trailing); !errors.Is(err, io.EOF) {
		problem(w, ErrInvalid)
		return false
	}
	return true
}
func out(w http.ResponseWriter, status int, v any, err error) {
	if err != nil {
		problem(w, err)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func problem(w http.ResponseWriter, err error) {
	status := http.StatusServiceUnavailable
	title := "Booking unavailable"
	if errors.Is(err, ErrInvalid) {
		status = http.StatusUnprocessableEntity
		title = "Invalid booking"
	}
	if errors.Is(err, ErrForbidden) {
		status = http.StatusForbidden
		title = "Booking access denied"
	}
	if errors.Is(err, ErrNotFound) {
		status = http.StatusNotFound
		title = "Booking not found"
	}
	if errors.Is(err, ErrConflict) {
		status = http.StatusConflict
		title = "Booking changed"
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}

var _ = strings.TrimSpace
