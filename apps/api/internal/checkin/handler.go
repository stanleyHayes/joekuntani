package checkin

// Check-in HTTP handlers for JK-025. These handlers use the in-memory service
// implementations in this scaffold for unit and integration tests. Replace auth
// and persistence with production implementations when wiring into runtime.

import (
	"encoding/json"
	"io"
	"net/http"
	"time"
)

// Health or quick probe for checkin subsystem
func HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok","subsystem":"checkin"}`))
}

type tokenRequest struct {
	Token string `json:"token"`
}

type maskedResponse struct {
	Status    string     `json:"status"`
	TicketID  string     `json:"ticket_id,omitempty"`
	CheckedIn bool       `json:"checked_in,omitempty"`
	CheckedAt *time.Time `json:"checked_in_at,omitempty"`
	Message   string     `json:"message,omitempty"`
}

// simpleAdminAuth checks a test-only header for admin auth. Replace with real session/CSRF checks.
func simpleAdminAuth(r *http.Request) bool {
	// In tests, set X-Admin-Auth: true
	return r.Header.Get("X-Admin-Auth") == "true"
}

// AdminScannerHandler handles admin-initiated scans and requires admin auth/CSRF.
// POST /api/admin/checkin/scan
func AdminScannerHandler(w http.ResponseWriter, r *http.Request) {
	if !simpleAdminAuth(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil || len(body) == 0 {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var req tokenRequest
	if err := json.Unmarshal(body, &req); err != nil || req.Token == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// Lookup ticket
	lookup, err := LookupTicketByToken(r.Context(), req.Token)
	if err != nil || lookup == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Attempt atomic check-in
	res, err := AtomicCheckin(r.Context(), lookup.EventID, lookup.TicketID)
	if err != nil {
		if err == ErrAlreadyCheckedIn {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(maskedResponse{Status: "already_checked_in", TicketID: lookup.TicketID, CheckedIn: true})
			return
		}
		http.Error(w, "internal", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(maskedResponse{Status: "ok", TicketID: res.TicketID, CheckedIn: res.CheckedIn, CheckedAt: res.CheckedAt})
}

// PublicCheckinHandler handles public scanner requests that present a token.
// POST /api/checkin
func PublicCheckinHandler(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil || len(body) == 0 {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var req tokenRequest
	if err := json.Unmarshal(body, &req); err != nil || req.Token == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	lookup, err := LookupTicketByToken(r.Context(), req.Token)
	if err != nil || lookup == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	res, err := AtomicCheckin(r.Context(), lookup.EventID, lookup.TicketID)
	if err != nil {
		if err == ErrAlreadyCheckedIn {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(maskedResponse{Status: "already_checked_in", TicketID: lookup.TicketID, CheckedIn: true})
			return
		}
		http.Error(w, "internal", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(maskedResponse{Status: "ok", TicketID: res.TicketID, CheckedIn: res.CheckedIn, CheckedAt: res.CheckedAt})
}
