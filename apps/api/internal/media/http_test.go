package media

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPUploadResponseIsSafeAndRBACEnforced(t *testing.T) {
	service, _, _ := setup(t)
	actor := Actor{ID: "private-actor-id", CanEditContent: true}
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) { return actor, nil })
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(validUpload())
	request := httptest.NewRequest(http.MethodPost, "/uploads", bytes.NewReader(body))
	response := httptest.NewRecorder()
	handler.Routes().ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), actor.ID) || strings.Contains(response.Body.String(), "api-secret") || strings.Contains(response.Body.String(), "hook-secret") || strings.Contains(response.Body.String(), "StorageKey") {
		t.Fatalf("response leaked private data: %s", response.Body.String())
	}

	denied, _ := NewHTTPHandler(service, func(*http.Request) (Actor, error) { return Actor{}, nil })
	response = httptest.NewRecorder()
	denied.Routes().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/assets", nil))
	if response.Code != http.StatusForbidden {
		t.Fatalf("wanted forbidden, got %d", response.Code)
	}
}

func TestHTTPCallbackRequiresSignedBoundedPayload(t *testing.T) {
	service, _, _ := setup(t)
	handler, _ := NewHTTPHandler(service, func(*http.Request) (Actor, error) { return Actor{}, ErrForbidden })
	request := httptest.NewRequest(http.MethodPost, "/callbacks/cloudinary", strings.NewReader(`{}`))
	request.Header.Set("X-Media-Timestamp", "0")
	request.Header.Set("X-Media-Event-ID", "event")
	request.Header.Set("X-Media-Signature", "00")
	response := httptest.NewRecorder()
	handler.Routes().ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("wanted rejected callback, got %d: %s", response.Code, response.Body.String())
	}

	oversized := httptest.NewRequest(http.MethodPost, "/callbacks/cloudinary", strings.NewReader(strings.Repeat("x", (64<<10)+1)))
	response = httptest.NewRecorder()
	handler.Routes().ServeHTTP(response, oversized)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("wanted bounded body rejection, got %d", response.Code)
	}
}
