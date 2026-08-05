package ticketops

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	p, ok := auth.PrincipalFromContext(r.Context())
	if !ok {
		h.problem(w, ErrForbidden)
		return
	}
	path := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/ticket-ops"), "/"), "/")
	if len(path) == 1 && path[0] == "orders" && r.Method == http.MethodGet {
		if !operator(p.Role) {
			h.problem(w, ErrForbidden)
			return
		}
		q := r.URL.Query()
		items, summary, e := h.service.List(r.Context(), OrderFilter{EventID: q.Get("event_id"), Status: q.Get("status"), Query: q.Get("q"), DateFrom: q.Get("date_from"), DateTo: q.Get("date_to")})
		h.json(w, http.StatusOK, map[string]any{"items": items, "summary": summary}, e)
		return
	}
	if len(path) == 3 && path[0] == "orders" && path[2] == "resend" && r.Method == http.MethodPost {
		if !operator(p.Role) {
			h.problem(w, ErrForbidden)
			return
		}
		h.json(w, http.StatusNoContent, nil, h.service.Resend(r.Context(), p.InternalUserID, path[1]))
		return
	}
	if len(path) == 3 && path[0] == "orders" && path[2] == "refund" && r.Method == http.MethodPost {
		if p.Role != auth.RoleAdministrator {
			h.problem(w, ErrForbidden)
			return
		}
		var in struct {
			Amount string `json:"amount"`
			Reason string `json:"reason"`
		}
		if !decode(w, r, &in) {
			return
		}
		v, e := h.service.Refund(r.Context(), p.InternalUserID, RefundInput{OrderID: path[1], Amount: in.Amount, Reason: in.Reason, IdempotencyKey: r.Header.Get("Idempotency-Key")})
		h.json(w, http.StatusAccepted, v, e)
		return
	}
	if len(path) == 3 && path[0] == "tickets" && path[2] == "void" && r.Method == http.MethodPost {
		if p.Role != auth.RoleAdministrator {
			h.problem(w, ErrForbidden)
			return
		}
		var in struct {
			Reason string `json:"reason"`
		}
		if !decode(w, r, &in) {
			return
		}
		h.json(w, http.StatusNoContent, nil, h.service.Void(r.Context(), p.InternalUserID, path[1], in.Reason))
		return
	}
	if len(path) == 3 && path[0] == "events" && path[2] == "attendees.csv" && r.Method == http.MethodGet {
		if !operator(p.Role) {
			h.problem(w, ErrForbidden)
			return
		}
		items, e := h.service.Attendees(r.Context(), p.InternalUserID, path[1])
		if e != nil {
			h.problem(w, e)
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=attendees.csv")
		writer := csv.NewWriter(w)
		_ = writer.Write([]string{"ticket_id", "order_reference", "ticket_type_id", "attendee_name", "buyer_name", "buyer_email", "status"})
		for _, v := range items {
			_ = writer.Write([]string{safeCSV(v.TicketID), safeCSV(v.OrderReference), safeCSV(v.TicketTypeID), safeCSV(v.AttendeeName), safeCSV(v.BuyerName), safeCSV(v.BuyerEmail), safeCSV(v.Status)})
		}
		writer.Flush()
		return
	}
	if len(path) == 3 && path[0] == "events" && path[2] == "cancel" && r.Method == http.MethodPost {
		if p.Role != auth.RoleAdministrator {
			h.problem(w, ErrForbidden)
			return
		}
		var in struct {
			Reason string `json:"reason"`
		}
		if !decode(w, r, &in) {
			return
		}
		n, e := h.service.CancelEvent(r.Context(), p.InternalUserID, path[1], in.Reason)
		h.json(w, http.StatusOK, map[string]int{"communications_queued": n}, e)
		return
	}
	w.WriteHeader(http.StatusNotFound)
}
func operator(role auth.Role) bool {
	return role == auth.RoleAdministrator || role == auth.RoleBookingManager
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		w.WriteHeader(http.StatusBadRequest)
		return false
	}
	if e := d.Decode(&struct{}{}); !errors.Is(e, io.EOF) {
		w.WriteHeader(http.StatusBadRequest)
		return false
	}
	return true
}
func (h *Handler) json(w http.ResponseWriter, status int, v any, e error) {
	if e != nil {
		h.problem(w, e)
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
func (*Handler) problem(w http.ResponseWriter, e error) {
	status := http.StatusServiceUnavailable
	if errors.Is(e, ErrInvalid) {
		status = http.StatusUnprocessableEntity
	}
	if errors.Is(e, ErrForbidden) {
		status = http.StatusForbidden
	}
	if errors.Is(e, ErrNotFound) {
		status = http.StatusNotFound
	}
	if errors.Is(e, ErrConflict) {
		status = http.StatusConflict
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "status": status, "title": http.StatusText(status)})
}
func safeCSV(v string) string {
	if v != "" && strings.ContainsRune("=+-@", rune(v[0])) {
		return "'" + v
	}
	return v
}
