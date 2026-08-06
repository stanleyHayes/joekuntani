package audit

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

func TestAuditSearchRoleAndBounds(t *testing.T) {
	t.Parallel()
	store := &MemoryStore{Items: sampleEntries()}
	service := NewService(store)

	admin := Actor{UserID: "admin", Role: auth.RoleAdministrator}
	response, err := service.Search(t.Context(), admin, Query{Text: "export", Limit: 10})
	if err != nil || len(response.Items) != 1 || response.Items[0].Action != "export.bookings" {
		t.Fatalf("export search: %#v err=%v", response, err)
	}

	analyst := Actor{UserID: "analyst", Role: auth.RoleAnalyst}
	if _, err = service.Search(t.Context(), analyst, Query{Text: "export"}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("analyst audit: %v", err)
	}

	if _, err = service.Search(t.Context(), admin, Query{Text: "ok", Limit: MaximumLimit + 1}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("limit: %v", err)
	}
	from := time.Date(2026, 8, 6, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 8, 5, 0, 0, 0, 0, time.UTC)
	if _, err = service.Search(t.Context(), admin, Query{From: &from, To: &to}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("range: %v", err)
	}
}

func TestAuditSearchCapsAndSignalsLimited(t *testing.T) {
	t.Parallel()
	items := make([]Entry, 0, 5)
	base := time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		items = append(items, Entry{
			ID:         fmt.Sprintf("10000000-0000-4000-8000-00000000000%d", i+1),
			Action:     "content.publish",
			EntityType: "content",
			EntityID:   "page",
			CreatedAt:  base.Add(time.Duration(i) * time.Minute),
		})
	}
	response, err := NewService(&MemoryStore{Items: items}).Search(t.Context(), Actor{UserID: "admin", Role: auth.RoleAdministrator}, Query{Action: "content.publish", Limit: 2})
	if err != nil || !response.Limited || len(response.Items) != 2 {
		t.Fatalf("limited response %#v err=%v", response, err)
	}
}

func TestHandlerAuditBoundaries(t *testing.T) {
	t.Parallel()
	handler := NewHandler(NewService(&MemoryStore{Items: sampleEntries()}), func(*http.Request) (Actor, error) {
		return Actor{UserID: "admin", Role: auth.RoleAdministrator}, nil
	})
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/audit?q=sign_in&limit=10", nil))
	if recorder.Code != http.StatusOK || recorder.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("ok response code=%d cache=%s", recorder.Code, recorder.Header().Get("Cache-Control"))
	}

	for _, target := range []string{"/api/admin/audit?limit=nope", "/api/admin/audit?from=yesterday"} {
		recorder = httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, target, nil))
		if recorder.Code != http.StatusUnprocessableEntity || recorder.Header().Get("Content-Type") != "application/problem+json" {
			t.Fatalf("%s => %d %s", target, recorder.Code, recorder.Header().Get("Content-Type"))
		}
	}

	denied := NewHandler(NewService(&MemoryStore{}), func(*http.Request) (Actor, error) { return Actor{}, errors.New("no") })
	recorder = httptest.NewRecorder()
	denied.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/audit", nil))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("denied=%d", recorder.Code)
	}
}
