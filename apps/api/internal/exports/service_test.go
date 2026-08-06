package exports

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

func TestRoleFilteredExportsAndAuditFailure(t *testing.T) {
	t.Parallel()
	store := &MemoryStore{
		Bookings: Result{Header: []string{"id"}, Rows: []Row{{"10000000-0000-4000-8000-000000000001"}}},
		Contacts: Result{Header: []string{"id"}, Rows: []Row{{"=1+2"}}},
	}
	service := NewService(store)

	admin := Actor{UserID: "admin", InternalID: "aaaaaaaaaaaaaaaaaaaaaaaa", Role: auth.RoleAdministrator}
	result, err := service.Export(t.Context(), admin, Request{Resource: ResourceContacts})
	if err != nil || result.Rows[0][0] != "'=1+2" || len(store.Audits) != 1 {
		t.Fatalf("admin contact export failed: %#v err=%v audits=%v", result, err, store.Audits)
	}

	analyst := Actor{UserID: "analyst", InternalID: "bbbbbbbbbbbbbbbbbbbbbbbb", Role: auth.RoleAnalyst}
	if _, err = service.Export(t.Context(), analyst, Request{Resource: ResourceContacts}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("analyst contacted PII: %v", err)
	}
	if _, err = service.Export(t.Context(), analyst, Request{Resource: ResourceBookings}); err != nil {
		t.Fatalf("analyst bookings: %v", err)
	}

	editor := Actor{UserID: "editor", InternalID: "cccccccccccccccccccccccc", Role: auth.RoleContentEditor}
	if _, err = service.Export(t.Context(), editor, Request{Resource: ResourceBookings}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editor export: %v", err)
	}

	store.FailAudit = true
	if _, err = service.Export(t.Context(), admin, Request{Resource: ResourceBookings}); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("audit failure: %v", err)
	}
}

func TestExportRejectsMissingActorAndUnknownResource(t *testing.T) {
	t.Parallel()
	service := NewService(&MemoryStore{})
	if _, err := service.Export(t.Context(), Actor{Role: auth.RoleAdministrator}, Request{Resource: ResourceBookings}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("missing actor: %v", err)
	}
	if _, err := service.Export(t.Context(), Actor{UserID: "x", InternalID: "y", Role: auth.RoleAdministrator}, Request{Resource: "tickets"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("unknown resource: %v", err)
	}
}

func TestHandlerCSVAndProblemBoundaries(t *testing.T) {
	t.Parallel()
	store := &MemoryStore{Bookings: Result{Header: []string{"id", "title"}, Rows: []Row{{"1", "Show"}}}}
	handler := NewHandler(NewService(store), func(*http.Request) (Actor, error) {
		return Actor{UserID: "admin", InternalID: "aaaaaaaaaaaaaaaaaaaaaaaa", Role: auth.RoleAdministrator}, nil
	})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/exports/bookings", nil))
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Header().Get("Content-Type"), "text/csv") || !strings.Contains(recorder.Body.String(), "id,title") {
		t.Fatalf("csv response invalid: code=%d type=%s body=%q", recorder.Code, recorder.Header().Get("Content-Type"), recorder.Body.String())
	}
	if recorder.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("cache=%q", recorder.Header().Get("Cache-Control"))
	}

	for _, test := range []struct {
		method, target string
		status         int
	}{
		{http.MethodPost, "/api/admin/exports/bookings", http.StatusMethodNotAllowed},
		{http.MethodGet, "/api/admin/exports/tickets", http.StatusUnprocessableEntity},
	} {
		recorder = httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(test.method, test.target, nil))
		if recorder.Code != test.status || recorder.Header().Get("Content-Type") != "application/problem+json" {
			t.Fatalf("%s %s: code=%d type=%s", test.method, test.target, recorder.Code, recorder.Header().Get("Content-Type"))
		}
	}

	denied := NewHandler(NewService(store), func(*http.Request) (Actor, error) { return Actor{}, errors.New("no session") })
	recorder = httptest.NewRecorder()
	denied.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/exports/bookings", nil))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("unauthenticated=%d", recorder.Code)
	}

	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/exports/resources", nil))
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "enquiries") {
		t.Fatalf("resources list: %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestAllowedResourcesByRole(t *testing.T) {
	t.Parallel()
	service := NewService(&MemoryStore{})
	resources, err := service.Allowed(Actor{UserID: "a", Role: auth.RoleAnalyst})
	if err != nil || len(resources) != 2 || resources[0] != ResourceBookings {
		t.Fatalf("analyst allowed=%v err=%v", resources, err)
	}
}
