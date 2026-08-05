package ticketing

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHTTPCreateIsStrictAndGeneric(t *testing.T) {
	store := &fakeStore{receipt: Receipt{Reference: "JKT-2026-ABCDEFGH", Status: StatusPending, Currency: "GHS", Total: "20.00", HoldExpiresAt: time.Now().Add(10 * time.Minute)}}
	service, _ := NewService(store, 10*time.Minute, nil)
	handler := NewHTTPHandler(service).CreateHandler()
	body := `{"event_id":"018f47f6-9f5d-4d3a-8d4e-45f0f7d4c111","buyer_name":"Test Buyer","buyer_email":"buyer@example.invalid","buyer_phone":"","terms_accepted":true,"terms_version":"2026-08-05","items":[{"ticket_type_id":"018f47f6-9f5d-4d3a-8d4e-45f0f7d4c112","quantity":2}]}`
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "0123456789abcdef")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status=%d headers=%v body=%s", response.Code, response.Header(), response.Body.String())
	}
	bad := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"unknown":true}`))
	bad.Header.Set("Content-Type", "application/json")
	out := httptest.NewRecorder()
	handler.ServeHTTP(out, bad)
	if out.Code != http.StatusBadRequest || !strings.Contains(out.Header().Get("Content-Type"), "problem+json") {
		t.Fatalf("status=%d content-type=%q", out.Code, out.Header().Get("Content-Type"))
	}
}
