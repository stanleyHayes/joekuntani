package content

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestPreviewIsAuthorizedPrivateAndNoIndex(t *testing.T) {
	domain, _ := domainFixture()
	item, err := domain.Create(t.Context(), editor, validPage())
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHTTPHandler(domain, func(*http.Request) (Actor, bool) { return editor, true })
	request := httptest.NewRequest(http.MethodGet, "/page/"+item.PublicID+"/preview", nil)
	context := chiRoute(request, "kind", "page", "id", item.PublicID)
	response := httptest.NewRecorder()
	handler.AdminPreviewHandler().ServeHTTP(response, context)
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "private, no-store" || response.Header().Get("X-Robots-Tag") != "noindex, nofollow" {
		t.Fatalf("preview response=%d %#v", response.Code, response.Header())
	}
}

func TestMutationRejectsUnknownFieldsAndWrongKind(t *testing.T) {
	domain, _ := domainFixture()
	handler := NewHTTPHandler(domain, func(*http.Request) (Actor, bool) { return editor, true })
	request := httptest.NewRequest(http.MethodPost, "/video", strings.NewReader(`{"title":"Video","unexpected":true}`))
	request.Header.Set("Content-Type", "application/json")
	request = chiRoute(request, "kind", "video")
	response := httptest.NewRecorder()
	handler.AdminCreateHandler().ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status=%d", response.Code)
	}
	request = httptest.NewRequest(http.MethodPost, "/unknown", strings.NewReader(`{"title":"No"}`))
	request.Header.Set("Content-Type", "application/json")
	request = chiRoute(request, "kind", "unknown")
	response = httptest.NewRecorder()
	handler.AdminCreateHandler().ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("wrong kind status=%d", response.Code)
	}
}

func TestWrongKindRouteCannotMutateContent(t *testing.T) {
	domain, store := domainFixture()
	item, err := domain.Create(t.Context(), editor, validPage())
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHTTPHandler(domain, func(*http.Request) (Actor, bool) { return approver, true })
	request := httptest.NewRequest(http.MethodPut, "/video/"+item.PublicID, strings.NewReader(`{"title":"Mutated","revision":1}`))
	request.Header.Set("Content-Type", "application/json")
	request = chiRoute(request, "kind", "video", "id", item.PublicID)
	response := httptest.NewRecorder()
	handler.AdminUpdateHandler().ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("wrong-kind update status=%d", response.Code)
	}
	if current := store.items[item.PublicID]; current.Title != item.Title || len(store.audits) != 1 {
		t.Fatalf("wrong-kind route mutated content: %#v audits=%d", current, len(store.audits))
	}
}

func TestUpdateRequiresRevisionAndLifecycleConflictsReturn409(t *testing.T) {
	domain, store := domainFixture()
	item, err := domain.Create(t.Context(), editor, validPage())
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHTTPHandler(domain, func(*http.Request) (Actor, bool) { return approver, true })
	request := chiRoute(httptest.NewRequest(http.MethodPut, "/page/"+item.PublicID, strings.NewReader(`{"title":"Missing revision"}`)), "kind", "page", "id", item.PublicID)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.AdminUpdateHandler().ServeHTTP(response, request)
	if response.Code != http.StatusConflict || store.items[item.PublicID].Title != item.Title {
		t.Fatalf("missing revision status=%d item=%#v", response.Code, store.items[item.PublicID])
	}
	request = chiRoute(httptest.NewRequest(http.MethodPatch, "/page/"+item.PublicID+"/publication", strings.NewReader(`{"action":"unpublish","revision":1,"publish_at":"","unpublish_at":""}`)), "kind", "page", "id", item.PublicID)
	request.Header.Set("Content-Type", "application/json")
	response = httptest.NewRecorder()
	handler.AdminPublicationHandler().ServeHTTP(response, request)
	if response.Code != http.StatusConflict {
		t.Fatalf("invalid lifecycle status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestOversizedURLReturns422BeforeRepository(t *testing.T) {
	domain, store := domainFixture()
	handler := NewHTTPHandler(domain, func(*http.Request) (Actor, bool) { return editor, true })
	body := `{"title":"Video","external_url":"https://example.invalid/` + strings.Repeat("a", 2049) + `","embed_url":"https://example.invalid/embed"}`
	request := chiRoute(httptest.NewRequest(http.MethodPost, "/video", strings.NewReader(body)), "kind", "video")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.AdminCreateHandler().ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity || len(store.items) != 0 || len(store.audits) != 0 {
		t.Fatalf("oversized URL status=%d items=%d audits=%d", response.Code, len(store.items), len(store.audits))
	}
}

func TestPublicEndpointNeverReturnsDraft(t *testing.T) {
	domain, _ := domainFixture()
	if _, err := domain.Create(t.Context(), editor, validPage()); err != nil {
		t.Fatal(err)
	}
	handler := NewHTTPHandler(domain, nil)
	request := chiRoute(httptest.NewRequest(http.MethodGet, "/page", nil), "kind", "page")
	response := httptest.NewRecorder()
	handler.PublicListHandler().ServeHTTP(response, request)
	if response.Code != http.StatusOK || strings.Contains(response.Body.String(), "About") {
		t.Fatalf("draft leaked: %s", response.Body.String())
	}
}

func chiRoute(request *http.Request, params ...string) *http.Request {
	routeContext := chi.NewRouteContext()
	for index := 0; index < len(params); index += 2 {
		routeContext.URLParams.Add(params[index], params[index+1])
	}
	return request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
}
