package checkin

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health/checkin", nil)
	r := httptest.NewRecorder()

	HealthHandler(r, req)

	if r.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", r.Code)
	}
	if r.Body == nil || r.Body.Len() == 0 {
		t.Fatalf("expected body, got empty")
	}
}
