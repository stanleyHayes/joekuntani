package checkin

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPublicCheckinFlow(t *testing.T) {
	// reset store
	storeMu.Lock()
	checked = map[string]bool{}
	storeMu.Unlock()

	// Use the scaffold token "test-token" which LookupTicketByToken understands
	body := bytes.NewBuffer([]byte(`{"token":"test-token"}`))
	req := httptest.NewRequest(http.MethodPost, "/api/checkin", body)
	r := httptest.NewRecorder()

	PublicCheckinHandler(r, req)

	if r.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d; body=%s", r.Code, r.Body.String())
	}

	// second attempt should return 409
	body2 := bytes.NewBuffer([]byte(`{"token":"test-token"}`))
	req2 := httptest.NewRequest(http.MethodPost, "/api/checkin", body2)
	r2 := httptest.NewRecorder()

	PublicCheckinHandler(r2, req2)
	if r2.Code != http.StatusConflict {
		t.Fatalf("expected 409 Conflict on second scan, got %d; body=%s", r2.Code, r2.Body.String())
	}
}

func TestAdminScannerRequiresAuth(t *testing.T) {
	// reset store
	storeMu.Lock()
	checked = map[string]bool{}
	storeMu.Unlock()

	body := bytes.NewBuffer([]byte(`{"token":"test-token"}`))
	req := httptest.NewRequest(http.MethodPost, "/api/admin/checkin/scan", body)
	r := httptest.NewRecorder()

	// Missing X-Admin-Auth => unauthorized
	AdminScannerHandler(r, req)
	if r.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized when missing admin header, got %d", r.Code)
	}

	// With header it should succeed
	body2 := bytes.NewBuffer([]byte(`{"token":"test-token"}`))
	req2 := httptest.NewRequest(http.MethodPost, "/api/admin/checkin/scan", body2)
	req2.Header.Set("X-Admin-Auth", "true")
	r2 := httptest.NewRecorder()

	AdminScannerHandler(r2, req2)
	if r2.Code != http.StatusOK {
		t.Fatalf("expected 200 OK when admin header present, got %d; body=%s", r2.Code, r2.Body.String())
	}
}
