package services

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

type telemetryRecorder struct{ slugs []string }

func (recorder *telemetryRecorder) ServiceViewed(slug string) {
	recorder.slugs = append(recorder.slugs, slug)
}

func TestPublicHTTPOnlyReturnsActiveOrderedServices(t *testing.T) {
	store := newMemoryStore()
	store.items[idOne] = Service{PublicID: idOne, Name: "Later", Slug: "later", Active: true, SortOrder: 2, CTA: CTA{Label: "Enquire", Href: "/book"}}
	store.items[idTwo] = Service{PublicID: idTwo, Name: "Hidden", Slug: "hidden", Active: false, SortOrder: 0}
	thirdID := "33333333-3333-4333-8333-333333333333"
	store.items[thirdID] = Service{PublicID: thirdID, Name: "First", Slug: "first", Active: true, SortOrder: 1, CTA: CTA{Label: "Enquire", Href: "/book"}}
	recorder := &telemetryRecorder{}
	handler := NewHTTPHandler(NewDomain(store, nil, nil), nil, recorder)

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	response := httptest.NewRecorder()
	handler.PublicRoutes().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("list returned %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Items []Service `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 2 || body.Items[0].Slug != "first" || body.Items[1].Slug != "later" {
		t.Fatalf("unexpected public list: %#v", body.Items)
	}

	request = httptest.NewRequest(http.MethodGet, "/first", nil)
	response = httptest.NewRecorder()
	handler.PublicRoutes().ServeHTTP(response, request)
	if response.Code != http.StatusOK || len(recorder.slugs) != 1 || recorder.slugs[0] != "first" {
		t.Fatalf("detail/telemetry failed: %d %#v", response.Code, recorder.slugs)
	}
	request = httptest.NewRequest(http.MethodGet, "/hidden", nil)
	response = httptest.NewRecorder()
	handler.PublicRoutes().ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("inactive detail returned %d", response.Code)
	}
}

func TestAdminHTTPRequiresActorAndRejectsUnknownFields(t *testing.T) {
	store := newMemoryStore()
	domain := testDomain(store, idOne, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
	denied := NewHTTPHandler(domain, func(*http.Request) (Actor, bool) { return Actor{}, false }, nil)
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	response := httptest.NewRecorder()
	denied.AdminRoutes().ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("missing actor returned %d", response.Code)
	}

	allowed := NewHTTPHandler(domain, func(*http.Request) (Actor, bool) {
		return Actor{InternalID: "64f000000000000000000001", PublicID: idTwo, CanEdit: true}, true
	}, nil)
	request = httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(`{"name":"Valid","unknown":true}`))
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	allowed.AdminRoutes().ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unknown field returned %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminHTTPCreatesAndUpdatesWithoutChangingSlug(t *testing.T) {
	store := newMemoryStore()
	domain := testDomain(store, idOne, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
	handler := NewHTTPHandler(domain, func(*http.Request) (Actor, bool) {
		return Actor{InternalID: "64f000000000000000000001", CanEdit: true}, true
	}, nil)
	payload := validInput("Brand partnership", 0)
	requestPayload := serviceRequest(payload)
	created := sendJSON(t, handler.AdminRoutes(), http.MethodPost, "/", requestPayload)
	if created.Code != http.StatusCreated || created.Header().Get("Location") != "/api/v1/services/brand-partnership" {
		t.Fatalf("create returned %d, %s, %s", created.Code, created.Header().Get("Location"), created.Body.String())
	}
	requestPayload.Name = "Updated partnership"
	updated := sendJSON(t, handler.AdminRoutes(), http.MethodPut, "/"+idOne, updateServiceRequest{serviceRequest: requestPayload, Version: 1})
	if updated.Code != http.StatusOK {
		t.Fatalf("update returned %d: %s", updated.Code, updated.Body.String())
	}
	if store.items[idOne].Slug != "brand-partnership" || len(store.audits) != 2 {
		t.Fatalf("slug/audit regression: %#v %#v", store.items[idOne], store.audits)
	}
}

func TestAdminHTTPRetiresWithIfMatchAndIsIdempotent(t *testing.T) {
	store := newMemoryStore()
	domain := testDomain(store, idOne, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
	actor := Actor{InternalID: "64f000000000000000000001", CanEdit: true}
	created, err := domain.Create(context.Background(), actor, validInput("Retire through HTTP", 0))
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHTTPHandler(domain, func(*http.Request) (Actor, bool) { return actor, true }, nil)
	request := httptest.NewRequest(http.MethodDelete, "/"+created.PublicID, nil)
	response := httptest.NewRecorder()
	handler.AdminRoutes().ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("missing If-Match returned %d: %s", response.Code, response.Body.String())
	}
	request = httptest.NewRequest(http.MethodDelete, "/"+created.PublicID, nil)
	request.Header.Set("If-Match", `"1"`)
	response = httptest.NewRecorder()
	handler.AdminRoutes().ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"state":"retired"`)) {
		t.Fatalf("retire returned %d: %s", response.Code, response.Body.String())
	}
	request = httptest.NewRequest(http.MethodDelete, "/"+created.PublicID, nil)
	request.Header.Set("If-Match", "1")
	response = httptest.NewRecorder()
	handler.AdminRoutes().ServeHTTP(response, request)
	if response.Code != http.StatusOK || len(store.audits) != 2 {
		t.Fatalf("idempotent retry returned %d with audits %#v", response.Code, store.audits)
	}
}

func sendJSON(t *testing.T, handler http.Handler, method, path string, value any) *httptest.ResponseRecorder {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(method, path, bytes.NewReader(data)).WithContext(context.Background())
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
