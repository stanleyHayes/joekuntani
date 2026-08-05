package events

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlerRequiresResolvedAuthorizationAndStrictJSON(t *testing.T) {
	service, _, actor := setupService()
	forbidden := NewHandler(service, func(*http.Request) (Actor, error) { return Actor{}, ErrForbidden })
	request := httptest.NewRequest(http.MethodGet, "/api/admin/events", nil)
	response := httptest.NewRecorder()
	forbidden.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d", response.Code)
	}

	handler := NewHandler(service, func(*http.Request) (Actor, error) { return actor, nil })
	request = httptest.NewRequest(http.MethodPost, "/api/admin/events", bytes.NewBufferString(`{"title":"x","unknown":true}`))
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unknown field status = %d", response.Code)
	}
	if response.Header().Get("Content-Type") != "application/problem+json" || !bytes.Contains(response.Body.Bytes(), []byte(`"status":422`)) {
		t.Fatalf("invalid response is not generic problem JSON: %s %s", response.Header().Get("Content-Type"), response.Body.String())
	}
}

func TestHandlerCreatePreviewAndLifecycleRoutes(t *testing.T) {
	service, _, actor := setupService()
	handler := NewHandler(service, func(*http.Request) (Actor, error) { return actor, nil })
	event := requestJSON(t, handler, http.MethodPost, "/api/admin/events", validEventInput(), http.StatusCreated)
	var created Event
	if err := json.Unmarshal(event.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	requestJSON(t, handler, http.MethodPost, "/api/admin/events/"+created.PublicID+"/tickets", validTicketInput(), http.StatusCreated)
	preview := requestJSON(t, handler, http.MethodGet, "/api/admin/events/"+created.PublicID+"/preview", nil, http.StatusOK)
	if !bytes.Contains(preview.Body.Bytes(), []byte(`"tickets"`)) {
		t.Fatalf("preview missing tickets: %s", preview.Body.String())
	}
	requestJSON(t, handler, http.MethodPost, "/api/admin/events/"+created.PublicID+"/publish", nil, http.StatusOK)
	conflict := requestJSON(t, handler, http.MethodPost, "/api/admin/events/"+created.PublicID+"/publish", nil, http.StatusConflict)
	if conflict.Header().Get("Content-Type") != "application/problem+json" || !bytes.Contains(conflict.Body.Bytes(), []byte(`"title":"Conflict"`)) {
		t.Fatalf("conflict response is not problem JSON: %s", conflict.Body.String())
	}
	requestJSON(t, handler, http.MethodPost, "/api/admin/events/"+created.PublicID+"/cancel", nil, http.StatusOK)
}

func requestJSON(t *testing.T, handler http.Handler, method, path string, body any, status int) *httptest.ResponseRecorder {
	t.Helper()
	var payload bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&payload).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	request := httptest.NewRequest(method, path, &payload)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != status {
		t.Fatalf("%s %s status = %d, want %d: %s", method, path, response.Code, status, response.Body.String())
	}
	return response
}
