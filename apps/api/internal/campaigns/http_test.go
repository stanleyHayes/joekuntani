package campaigns

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandlerRejectsUnauthenticatedAndUnknownInput(t *testing.T) {
	service, _ := service()
	denied := NewHandler(service, func(*http.Request) (Actor, error) {
		return Actor{}, errors.New("no session")
	})
	request := httptest.NewRequest(http.MethodGet, "/api/admin/campaigns", nil)
	response := httptest.NewRecorder()
	denied.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("denied response=%d cache=%q", response.Code, response.Header().Get("Cache-Control"))
	}

	authorized := NewHandler(service, func(*http.Request) (Actor, error) {
		return Actor{ID: "admin", Role: "administrator"}, nil
	})
	request = httptest.NewRequest(http.MethodPost, "/api/admin/campaigns", strings.NewReader(`{"unexpected":true}`))
	response = httptest.NewRecorder()
	authorized.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity || response.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("invalid response=%d content-type=%q", response.Code, response.Header().Get("Content-Type"))
	}
}
