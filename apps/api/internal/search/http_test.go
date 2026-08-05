package search

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

func TestHandlerBoundariesAndNoStore(t *testing.T) {
	t.Parallel()
	handler := NewHandler(NewService(&fakeStore{}), func(*http.Request) (Actor, error) { return Actor{UserID: "staff", Role: auth.RoleContentEditor}, nil })
	for _, test := range []struct {
		method, target string
		status         int
	}{
		{http.MethodGet, "/api/admin/search?q=launch&limit=5", http.StatusOK},
		{http.MethodGet, "/api/admin/search?q=x", http.StatusUnprocessableEntity},
		{http.MethodGet, "/api/admin/search?q=launch&limit=nope", http.StatusUnprocessableEntity},
		{http.MethodPost, "/api/admin/search?q=launch", http.StatusMethodNotAllowed},
	} {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(test.method, test.target, strings.NewReader(`{"q":"ignored"}`)))
		cache := recorder.Header().Get("Cache-Control")
		if recorder.Code != test.status || (cache != "private, no-store" && cache != "no-store") {
			t.Fatalf("%s %s: code=%d cache=%q", test.method, test.target, recorder.Code, recorder.Header().Get("Cache-Control"))
		}
		if test.status != http.StatusOK && recorder.Header().Get("Content-Type") != "application/problem+json" {
			t.Fatalf("expected Problem response, got %q", recorder.Header().Get("Content-Type"))
		}
	}
}

func TestHandlerRejectsUnauthenticated(t *testing.T) {
	t.Parallel()
	handler := NewHandler(NewService(&fakeStore{}), func(*http.Request) (Actor, error) { return Actor{}, errors.New("no session") })
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/search?q=launch", nil))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("got %d", recorder.Code)
	}
}
