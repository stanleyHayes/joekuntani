package media

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// seedAsset puts an asset straight into the repository so a test can start from
// a given status without driving the whole upload dance.
func seedAsset(t *testing.T, repo *MemoryRepository, asset Asset) {
	t.Helper()
	repo.mu.Lock()
	defer repo.mu.Unlock()
	repo.assets[asset.PublicID] = asset
}

func readyAsset() Asset {
	return Asset{
		PublicID:   "56f5dd3d-46e8-4944-8b61-eef60450c6d0",
		StorageKey: "joe-kuntani/local/content/56f5dd3d",
		Filename:   "stage.jpeg",
		MIMEType:   "image/jpeg",
		PublicURL:  "https://res.cloudinary.com/demo/image/upload/v1/stage.jpg",
		Folder:     "content",
		AltText:    "Joe on stage",
		Tags:       []string{"content"},
		Bytes:      12345,
		Width:      854,
		Height:     1280,
		Status:     StatusReady,
		UploadedBy: "private-actor-id",
		CreatedAt:  fixedTime,
		UpdatedAt:  fixedTime,
	}
}

func publicRouter(t *testing.T, service *Service) http.Handler {
	t.Helper()
	handler, err := NewHTTPHandler(service, func(*http.Request) (Actor, error) {
		return Actor{}, ErrForbidden
	})
	if err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	router.Method(http.MethodGet, "/api/public/media/assets/{assetID}", handler.PublicAssetHandler())
	return router
}

// The public site stores bare asset ids on its content. Without this route the
// site could not turn one into a URL, so no CMS image and no social card ever
// rendered.
func TestPublicAssetResolvesAReadyAssetWithoutASession(t *testing.T) {
	service, repo, _ := setup(t)
	seedAsset(t, repo, readyAsset())

	response := httptest.NewRecorder()
	publicRouter(t, service).ServeHTTP(response, httptest.NewRequest(
		http.MethodGet, "/api/public/media/assets/56f5dd3d-46e8-4944-8b61-eef60450c6d0", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		ID        string   `json:"id"`
		PublicURL string   `json:"public_url"`
		MIMEType  string   `json:"mime_type"`
		Status    string   `json:"status"`
		AltText   string   `json:"alt_text"`
		Width     int      `json:"width"`
		Height    int      `json:"height"`
		Tags      []string `json:"tags"`
		UpdatedAt string   `json:"updated_at"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	// These four are exactly what the web client checks before rendering.
	if body.Status != "ready" || !strings.HasPrefix(body.MIMEType, "image/") {
		t.Fatalf("client would reject this asset: %#v", body)
	}
	if body.PublicURL != "https://res.cloudinary.com/demo/image/upload/v1/stage.jpg" {
		t.Fatalf("public_url = %q", body.PublicURL)
	}
	if body.ID != "56f5dd3d-46e8-4944-8b61-eef60450c6d0" {
		t.Fatalf("id = %q", body.ID)
	}
	if body.Width != 854 || body.Height != 1280 || body.AltText != "Joe on stage" {
		t.Fatalf("layout and alt data missing: %#v", body)
	}
	if body.UpdatedAt == "" {
		t.Fatal("updated_at missing")
	}
}

// An anonymous reader must not learn the storage key, the uploader, or anything
// else the admin projection carries.
func TestPublicAssetWithholdsInternalFields(t *testing.T) {
	service, repo, _ := setup(t)
	seedAsset(t, repo, readyAsset())

	response := httptest.NewRecorder()
	publicRouter(t, service).ServeHTTP(response, httptest.NewRequest(
		http.MethodGet, "/api/public/media/assets/56f5dd3d-46e8-4944-8b61-eef60450c6d0", nil))

	for _, secret := range []string{"private-actor-id", "joe-kuntani/local/content", "storage_key", "uploaded_by", "bytes", "folder"} {
		if strings.Contains(response.Body.String(), secret) {
			t.Fatalf("public payload leaked %q: %s", secret, response.Body.String())
		}
	}
}

// Anything not ready has either no file behind it or one that was withdrawn.
// All of them answer 404 so the library cannot be probed anonymously.
func TestPublicAssetHidesEverythingNotReady(t *testing.T) {
	for _, status := range []Status{StatusDraft, StatusUploading, StatusFailed, StatusDeleting, StatusDeleted} {
		t.Run(string(status), func(t *testing.T) {
			service, repo, _ := setup(t)
			asset := readyAsset()
			asset.Status = status
			seedAsset(t, repo, asset)

			response := httptest.NewRecorder()
			publicRouter(t, service).ServeHTTP(response, httptest.NewRequest(
				http.MethodGet, "/api/public/media/assets/"+asset.PublicID, nil))
			if response.Code != http.StatusNotFound {
				t.Fatalf("status %d for %s", response.Code, status)
			}
			if strings.Contains(response.Body.String(), "res.cloudinary.com") {
				t.Fatalf("withheld asset still leaked its URL: %s", response.Body.String())
			}
		})
	}
}

func TestPublicAssetAnswers404ForUnknownID(t *testing.T) {
	service, _, _ := setup(t)
	response := httptest.NewRecorder()
	publicRouter(t, service).ServeHTTP(response, httptest.NewRequest(
		http.MethodGet, "/api/public/media/assets/00000000-0000-4000-8000-00000000dead", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("status %d", response.Code)
	}
}

func TestPublicAssetServiceRejectsNotReady(t *testing.T) {
	service, repo, _ := setup(t)
	asset := readyAsset()
	asset.Status = StatusDraft
	seedAsset(t, repo, asset)
	if _, err := service.PublicAsset(context.Background(), asset.PublicID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("PublicAsset = %v, want ErrNotFound", err)
	}
}
