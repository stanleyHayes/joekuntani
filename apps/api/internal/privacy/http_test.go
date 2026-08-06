package privacy

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

func TestHandlerStatusAndHoldBoundaries(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	handler := NewHandler(NewService(store, nil, func() (string, error) {
		return "10000000-0000-4000-8000-000000000010", nil
	}), func(*http.Request) (Actor, error) {
		return Actor{UserID: "admin", InternalID: "aaaaaaaaaaaaaaaaaaaaaaaa", Role: auth.RoleAdministrator}, nil
	})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/privacy", nil))
	if recorder.Code != http.StatusOK || recorder.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("status code=%d cache=%s body=%s", recorder.Code, recorder.Header().Get("Cache-Control"), recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"retention_months":24`) {
		t.Fatalf("body=%s", recorder.Body.String())
	}

	recorder = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/admin/privacy/holds", strings.NewReader(`{"contact_id":"20000000-0000-4000-8000-000000000002","reason":"Court order requires preservation"}`))
	req.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("hold code=%d body=%s", recorder.Code, recorder.Body.String())
	}

	recorder = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/admin/privacy/holds", strings.NewReader(`{"contact_id":"20000000-0000-4000-8000-000000000002","reason":"Court order requires preservation"}{"extra":true}`))
	req.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("trailing json code=%d", recorder.Code)
	}
}
