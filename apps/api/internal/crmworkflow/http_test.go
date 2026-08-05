package crmworkflow

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHandlerRBACStrictInputAndNoStore(t *testing.T) {
	store := &memoryStore{tasks: map[string]Task{}, attachments: map[string]Attachment{}, deliveries: map[string]Delivery{}}
	service := New(store, assets{true}, nil, func() time.Time { return time.Date(2026, 8, 5, 17, 0, 0, 0, time.UTC) }, func() (string, error) { return "00000000-0000-4000-8000-000000000001", nil })
	actor := Actor{InternalID: "staff", Permissions: map[Permission]bool{PermissionRead: true, PermissionWrite: true}}
	handler := NewHandler(service, func(*http.Request) (Actor, error) { return actor, nil })
	request := httptest.NewRequest(http.MethodPost, "/api/admin/crm/enquiries/enquiry/notes", strings.NewReader(`{"body":"private note","public":true}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("strict status=%d body=%s", response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("cache=%q", response.Header().Get("Cache-Control"))
	}
	request = httptest.NewRequest(http.MethodPost, "/api/admin/crm/enquiries/enquiry/notes", strings.NewReader(`{"body":"private note"}`))
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "email") || strings.Contains(response.Body.String(), "phone") {
		t.Fatal("PII leaked")
	}
}

func TestHandlerRejectsTrailingJSONDocument(t *testing.T) {
	store := &memoryStore{tasks: map[string]Task{}, attachments: map[string]Attachment{}, deliveries: map[string]Delivery{}}
	service := New(store, assets{true}, nil, func() time.Time { return time.Date(2026, 8, 5, 17, 0, 0, 0, time.UTC) }, func() (string, error) { return "00000000-0000-4000-8000-000000000001", nil })
	actor := Actor{InternalID: "staff", Permissions: map[Permission]bool{PermissionRead: true, PermissionWrite: true}}
	handler := NewHandler(service, func(*http.Request) (Actor, error) { return actor, nil })

	for _, test := range []struct {
		name string
		path string
		body string
	}{
		{name: "note", path: "/api/admin/crm/enquiries/enquiry/notes", body: `{"body":"private note"} {"body":"second note"}`},
		{name: "task", path: "/api/admin/crm/enquiries/enquiry/tasks", body: `{"title":"Call client","assignee_id":"staff","priority":"normal","due_at":"2026-08-06T17:00:00Z"} {}`},
		{name: "attachment", path: "/api/admin/crm/enquiries/enquiry/attachments", body: `{"asset_id":"00000000-0000-4000-8000-000000000002","label":"Proposal"} null`},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, test.path, strings.NewReader(test.body))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
		})
	}

	if len(store.notes) != 0 || len(store.tasks) != 0 || len(store.attachments) != 0 {
		t.Fatalf("trailing documents caused writes: notes=%d tasks=%d attachments=%d", len(store.notes), len(store.tasks), len(store.attachments))
	}
}
