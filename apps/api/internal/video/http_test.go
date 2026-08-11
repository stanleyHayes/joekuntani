package video

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestAdminUploadHTTPRequiresAuthenticatedAdministrator(t *testing.T) {
	service, _, _ := testService(t)
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) {
		return Actor{}, errors.New("no session")
	}, "secret")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/admin/videos/uploads", strings.NewReader(`{"title":"Live set"}`))
	response := httptest.NewRecorder()
	handler.AdminCreateUpload().ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized || !strings.Contains(response.Body.String(), "Authentication required") {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestAdminCategoryHTTPCreateListAndUpdate(t *testing.T) {
	service, _, _ := testService(t)
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) { return admin(), nil }, "secret")
	if err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	router.Method(http.MethodGet, "/api/admin/video-categories", handler.AdminCategories())
	router.Method(http.MethodPost, "/api/admin/video-categories", handler.AdminCategories())
	router.Method(http.MethodPatch, "/api/admin/video-categories/{categoryID}", handler.AdminCategories())

	createdResponse := httptest.NewRecorder()
	router.ServeHTTP(createdResponse, httptest.NewRequest(http.MethodPost, "/api/admin/video-categories", strings.NewReader(`{"title":"Music"}`)))
	if createdResponse.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", createdResponse.Code, createdResponse.Body.String())
	}
	var created categoryResponse
	if err = json.Unmarshal(createdResponse.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Title != "Music" || !created.Active || created.Slug != "music" {
		t.Fatalf("created=%+v", created)
	}

	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, httptest.NewRequest(http.MethodGet, "/api/admin/video-categories", nil))
	if listResponse.Code != http.StatusOK || !strings.Contains(listResponse.Body.String(), `"title":"Music"`) {
		t.Fatalf("list status=%d body=%s", listResponse.Code, listResponse.Body.String())
	}

	updateResponse := httptest.NewRecorder()
	body := `{"title":"Music sessions","description":"Guitar and songs","image_asset_id":"asset","active":true,"sort_order":2,"revision":1}`
	router.ServeHTTP(updateResponse, httptest.NewRequest(http.MethodPatch, "/api/admin/video-categories/"+created.ID, strings.NewReader(body)))
	if updateResponse.Code != http.StatusOK || !strings.Contains(updateResponse.Body.String(), `"revision":2`) {
		t.Fatalf("update status=%d body=%s", updateResponse.Code, updateResponse.Body.String())
	}
}

func TestAdminUploadHTTPRejectsAuthenticatedNonAdministrator(t *testing.T) {
	service, _, _ := testService(t)
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) {
		return Actor{ID: "507f1f77bcf86cd799439012", CanManage: false}, nil
	}, "secret")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(validInput())
	response := httptest.NewRecorder()
	handler.AdminCreateUpload().ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/admin/videos/uploads", bytes.NewReader(body)))
	if response.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestAdminUploadHTTPReturnsOnlyShortLivedAuthorization(t *testing.T) {
	service, _, _ := testService(t)
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) { return admin(), nil }, "secret")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(validInput())
	request := httptest.NewRequest(http.MethodPost, "/api/admin/videos/uploads", bytes.NewReader(body))
	response := httptest.NewRecorder()
	handler.AdminCreateUpload().ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err = json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	upload, ok := payload["upload"].(map[string]any)
	if !ok || upload["signature"] == "" || upload["video_id"] == "" {
		t.Fatalf("upload=%v", payload["upload"])
	}
	if strings.Contains(response.Body.String(), "server-secret") || strings.Contains(response.Body.String(), "write-key") {
		t.Fatal("provider credential leaked in response")
	}
}

func TestPublicVideoHTTPExposesPlaybackButNotAdminMetadata(t *testing.T) {
	service, _, provider := testService(t)
	item, _, err := service.CreateUpload(t.Context(), admin(), validInput())
	if err != nil {
		t.Fatal(err)
	}
	provider.status = StatusReady
	item, err = service.Synchronize(t.Context(), admin(), item.PublicID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.Publish(t.Context(), admin(), item.PublicID, true, item.Revision); err != nil {
		t.Fatal(err)
	}
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) { return admin(), nil }, "secret")
	if err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	router.Method(http.MethodGet, "/api/public/videos/{videoID}", handler.PublicItem())
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/public/videos/"+item.PublicID, nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err = json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["playback"] == nil || payload["thumbnail_url"] == "" {
		t.Fatalf("public payload=%v", payload)
	}
	for _, privateField := range []string{"provider", "filename", "mime_type", "bytes", "revision", "failure_reason"} {
		if _, exists := payload[privateField]; exists {
			t.Fatalf("public response leaked %s", privateField)
		}
	}
}

func TestAdminUploadHTTPRejectsUnknownAndTrailingJSON(t *testing.T) {
	service, _, _ := testService(t)
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) { return admin(), nil }, "secret")
	if err != nil {
		t.Fatal(err)
	}
	for _, body := range []string{
		`{"title":"Live set","unknown":true}`,
		`{"title":"Live set"}{"title":"Second"}`,
	} {
		response := httptest.NewRecorder()
		handler.AdminCreateUpload().ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/admin/videos/uploads", strings.NewReader(body)))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("body=%s status=%d response=%s", body, response.Code, response.Body.String())
		}
	}
}

// Regression: the admin client and the OpenAPI contract both send snake_case
// (sort_order, mime_type). These tests post the exact wire payload instead of
// marshaling the Go struct, which previously masked the missing JSON tags.
func TestAdminUploadHTTPAcceptsExactAdminClientPayload(t *testing.T) {
	service, _, _ := testService(t)
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) { return admin(), nil }, "secret")
	if err != nil {
		t.Fatal(err)
	}
	body := `{"title":"Live set","slug":"live-set","description":"Behind the booth","category":"sets","tags":["live","accra"],"visibility":"public","sort_order":3,"filename":"live-set.mp4","mime_type":"video/mp4","bytes":900}`
	response := httptest.NewRecorder()
	handler.AdminCreateUpload().ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/admin/videos/uploads", strings.NewReader(body)))
	if response.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	var payload struct {
		Item itemResponse `json:"item"`
	}
	if err = json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Item.SortOrder != 3 || payload.Item.MIMEType != "video/mp4" || payload.Item.Filename != "live-set.mp4" || payload.Item.Bytes != 900 {
		t.Fatalf("item=%+v", payload.Item)
	}
}

func TestAdminUpdateHTTPAcceptsExactAdminClientPayload(t *testing.T) {
	service, _, _ := testService(t)
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) { return admin(), nil }, "secret")
	if err != nil {
		t.Fatal(err)
	}
	item, _, err := service.CreateUpload(t.Context(), admin(), validInput())
	if err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	router.Method(http.MethodPatch, "/api/admin/videos/{videoID}", handler.AdminItem())
	body := `{"title":"Live set (remaster)","description":"Behind the booth","category":"sets","tags":["live"],"visibility":"unlisted","sort_order":7,"revision":1}`
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPatch, "/api/admin/videos/"+item.PublicID, strings.NewReader(body)))
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	var updated itemResponse
	if err = json.Unmarshal(response.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.SortOrder != 7 || updated.Visibility != VisibilityUnlisted || updated.Title != "Live set (remaster)" {
		t.Fatalf("item=%+v", updated)
	}
}

func TestVideoHTTPLifecycleCreateListPublishUnpublishAndDelete(t *testing.T) {
	service, _, provider := testService(t)
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) { return admin(), nil }, "secret")
	if err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	router.Method(http.MethodPost, "/api/admin/videos/uploads", handler.AdminCreateUpload())
	router.Method(http.MethodGet, "/api/admin/videos", handler.AdminList())
	router.Method(http.MethodPatch, "/api/admin/videos/{videoID}/publication", handler.AdminPublish())
	router.Method(http.MethodDelete, "/api/admin/videos/{videoID}", handler.AdminItem())
	router.Method(http.MethodGet, "/api/public/videos/{videoID}", handler.PublicItem())

	createBody, _ := json.Marshal(validInput())
	created := httptest.NewRecorder()
	router.ServeHTTP(created, httptest.NewRequest(http.MethodPost, "/api/admin/videos/uploads", bytes.NewReader(createBody)))
	if created.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
	}
	var createdPayload struct {
		Item itemResponse `json:"item"`
	}
	if err = json.Unmarshal(created.Body.Bytes(), &createdPayload); err != nil {
		t.Fatal(err)
	}
	provider.status = StatusReady
	item, err := service.Synchronize(t.Context(), admin(), createdPayload.Item.ID)
	if err != nil {
		t.Fatal(err)
	}

	list := httptest.NewRecorder()
	router.ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/api/admin/videos", nil))
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), createdPayload.Item.ID) {
		t.Fatalf("list status=%d body=%s", list.Code, list.Body.String())
	}

	publishBody := strings.NewReader(`{"published":true,"revision":` + jsonNumber(item.Revision) + `}`)
	published := httptest.NewRecorder()
	router.ServeHTTP(published, httptest.NewRequest(http.MethodPatch, "/api/admin/videos/"+item.PublicID+"/publication", publishBody))
	if published.Code != http.StatusOK {
		t.Fatalf("publish status=%d body=%s", published.Code, published.Body.String())
	}
	var publishedItem itemResponse
	if err = json.Unmarshal(published.Body.Bytes(), &publishedItem); err != nil {
		t.Fatal(err)
	}
	public := httptest.NewRecorder()
	router.ServeHTTP(public, httptest.NewRequest(http.MethodGet, "/api/public/videos/"+item.PublicID, nil))
	if public.Code != http.StatusOK {
		t.Fatalf("public status=%d body=%s", public.Code, public.Body.String())
	}

	unpublish := httptest.NewRecorder()
	unpublishBody := strings.NewReader(`{"published":false,"revision":` + jsonNumber(publishedItem.Revision) + `}`)
	router.ServeHTTP(unpublish, httptest.NewRequest(http.MethodPatch, "/api/admin/videos/"+item.PublicID+"/publication", unpublishBody))
	if unpublish.Code != http.StatusOK {
		t.Fatalf("unpublish status=%d body=%s", unpublish.Code, unpublish.Body.String())
	}
	var unpublishedItem itemResponse
	if err = json.Unmarshal(unpublish.Body.Bytes(), &unpublishedItem); err != nil {
		t.Fatal(err)
	}
	deleted := httptest.NewRecorder()
	router.ServeHTTP(deleted, httptest.NewRequest(http.MethodDelete, "/api/admin/videos/"+item.PublicID+"?revision="+jsonNumber(unpublishedItem.Revision), nil))
	if deleted.Code != http.StatusNoContent || !provider.deleted {
		t.Fatalf("delete status=%d providerDeleted=%v body=%s", deleted.Code, provider.deleted, deleted.Body.String())
	}
}

func jsonNumber(value int64) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}
