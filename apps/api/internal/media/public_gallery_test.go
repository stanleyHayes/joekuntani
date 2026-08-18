package media

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

// galleryAsset starts from the shared ready fixture and moves it into the
// folder the service queries — the policy prefix joined with "gallery".
func galleryAsset(id string, createdAt time.Time) Asset {
	asset := readyAsset()
	asset.PublicID = id
	asset.Folder = "staging/gallery"
	asset.StorageKey = "staging/gallery/" + id
	asset.CreatedAt = createdAt
	asset.UpdatedAt = createdAt
	return asset
}

func galleryRouter(t *testing.T, service *Service) http.Handler {
	t.Helper()
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) {
		return Actor{}, ErrForbidden
	})
	if err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	router.Method(http.MethodGet, "/api/public/media/gallery", handler.PublicGalleryHandler())
	return router
}

func TestPublicGalleryReturnsReadyGalleryImagesNewestFirst(t *testing.T) {
	service, repo, _ := setup(t)
	older := galleryAsset("11111111-1111-4111-8111-111111111111", fixedTime.Add(-time.Hour))
	newer := galleryAsset("22222222-2222-4222-8222-222222222222", fixedTime)
	seedAsset(t, repo, older)
	seedAsset(t, repo, newer)

	assets, err := service.PublicGallery(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(assets) != 2 || assets[0].PublicID != newer.PublicID || assets[1].PublicID != older.PublicID {
		t.Fatalf("expected newest first, got %#v", assets)
	}
}

// Drafts, other folders and non-images all stay in the library; the listing
// must not admit any of them.
func TestPublicGalleryExcludesEverythingThatIsNotAReadyGalleryImage(t *testing.T) {
	service, repo, _ := setup(t)
	draft := galleryAsset("33333333-3333-4333-8333-333333333333", fixedTime)
	draft.Status = StatusDraft
	otherFolder := galleryAsset("44444444-4444-4444-8444-444444444444", fixedTime)
	otherFolder.Folder = "staging/content"
	document := galleryAsset("55555555-5555-4555-8555-555555555555", fixedTime)
	document.MIMEType = "application/pdf"
	for _, asset := range []Asset{draft, otherFolder, document} {
		seedAsset(t, repo, asset)
	}

	assets, err := service.PublicGallery(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(assets) != 0 {
		t.Fatalf("expected an empty gallery, got %#v", assets)
	}
}

func TestPublicGalleryEmptyResultIsAnEmptyList(t *testing.T) {
	service, _, _ := setup(t)
	response := httptest.NewRecorder()
	galleryRouter(t, service).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/public/media/gallery", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Assets []json.RawMessage `json:"assets"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Assets == nil || len(body.Assets) != 0 {
		t.Fatalf("assets must be an empty array, got %s", response.Body.String())
	}
}

// An anonymous reader must not learn the folder, storage key, uploader or byte
// size — the gallery projection is as narrow as the single-asset one.
func TestPublicGalleryWithholdsInternalFields(t *testing.T) {
	service, repo, _ := setup(t)
	seedAsset(t, repo, galleryAsset("66666666-6666-4666-8666-666666666666", fixedTime))

	response := httptest.NewRecorder()
	galleryRouter(t, service).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/public/media/gallery", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Assets []struct {
			AssetID   string   `json:"asset_id"`
			PublicURL string   `json:"public_url"`
			AltText   string   `json:"alt_text"`
			Width     int      `json:"width"`
			Height    int      `json:"height"`
			Tags      []string `json:"tags"`
			CreatedAt string   `json:"created_at"`
		} `json:"assets"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Assets) != 1 {
		t.Fatalf("expected one asset, got %s", response.Body.String())
	}
	item := body.Assets[0]
	if item.AssetID != "66666666-6666-4666-8666-666666666666" || item.PublicURL == "" || item.AltText != "Joe on stage" || item.Width != 854 || item.Height != 1280 || item.CreatedAt == "" {
		t.Fatalf("gallery projection incomplete: %#v", item)
	}
	for _, secret := range []string{"private-actor-id", "staging/gallery", "storage_key", "uploaded_by", "bytes", "folder", "mime_type", "status"} {
		if strings.Contains(response.Body.String(), secret) {
			t.Fatalf("gallery payload leaked %q: %s", secret, response.Body.String())
		}
	}
}
