package video

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"testing"
	"time"
)

type fakeProvider struct {
	status    Status
	deleted   bool
	createErr error
}

func (provider *fakeProvider) Name() string { return "bunny" }
func (provider *fakeProvider) Create(context.Context, string) (ProviderVideo, error) {
	if provider.createErr != nil {
		return ProviderVideo{}, provider.createErr
	}
	return ProviderVideo{ID: "provider-guid", LibraryID: "42", Status: StatusUploading}, nil
}
func (provider *fakeProvider) Get(context.Context, string) (ProviderVideo, error) {
	return ProviderVideo{ID: "provider-guid", LibraryID: "42", Status: provider.status, DurationSeconds: 91, ThumbnailURL: "https://cdn.example/provider-guid/thumbnail.jpg"}, nil
}
func (provider *fakeProvider) Delete(context.Context, string) error {
	provider.deleted = true
	return nil
}
func (provider *fakeProvider) UploadAuthorization(id, filename, mime string, expires time.Time) (UploadAuthorization, error) {
	return UploadAuthorization{Endpoint: "https://video.example/tusupload", Signature: "short-lived-signature", VideoID: id, LibraryID: "42", Filename: filename, MIMEType: mime, ExpirationTime: expires.Unix()}, nil
}
func (provider *fakeProvider) Playback(id string) PlaybackInfo {
	return PlaybackInfo{EmbedURL: "https://player.example/" + id, HLSURL: "https://cdn.example/" + id + "/playlist.m3u8", ThumbnailURL: "https://cdn.example/" + id + "/thumbnail.jpg"}
}

func testService(t *testing.T) (*Service, *MemoryRepository, *fakeProvider) {
	t.Helper()
	repository := NewMemoryRepository()
	provider := &fakeProvider{}
	service, err := NewService(repository, provider, Config{Enabled: true, LibraryID: "42", WebhookSecret: "secret", MaxBytes: 1000, UploadTTL: time.Hour, AllowedMIMETypes: map[string]bool{"video/mp4": true}}, func() time.Time { return time.Date(2026, 8, 10, 1, 0, 0, 0, time.UTC) })
	if err != nil {
		t.Fatal(err)
	}
	return service, repository, provider
}
func admin() Actor { return Actor{ID: "507f1f77bcf86cd799439011", CanManage: true} }
func validInput() CreateInput {
	return CreateInput{Title: "Live set", Slug: "live-set", Filename: "live-set.mp4", MIMEType: "video/mp4", Bytes: 900, Visibility: VisibilityPublic}
}

func TestCreateUploadValidatesBeforeCallingProvider(t *testing.T) {
	service, _, provider := testService(t)
	input := validInput()
	input.MIMEType = "image/jpeg"
	if _, _, err := service.CreateUpload(context.Background(), admin(), input); !errors.Is(err, ErrInvalid) {
		t.Fatalf("err=%v", err)
	}
	if provider.deleted {
		t.Fatal("provider should not be touched")
	}
}

func TestCategoryRequiresOnlyTitleAndDefaultsActive(t *testing.T) {
	service, _, _ := testService(t)
	category, err := service.CreateCategory(t.Context(), admin(), CategoryInput{Title: "  Acting & Film  "})
	if err != nil {
		t.Fatal(err)
	}
	if category.Title != "Acting & Film" || category.Slug != "acting-film" || !category.Active || category.Description != "" || category.ImageAssetID != "" || category.Revision != 1 {
		t.Fatalf("category=%+v", category)
	}
	items, err := service.ListCategories(t.Context(), admin())
	if err != nil || len(items) != 1 || items[0].PublicID != category.PublicID {
		t.Fatalf("items=%+v err=%v", items, err)
	}
}

func TestCategoryUpdatePreservesSlugAndUsesRevision(t *testing.T) {
	service, _, _ := testService(t)
	category, err := service.CreateCategory(t.Context(), admin(), CategoryInput{Title: "Comedy"})
	if err != nil {
		t.Fatal(err)
	}
	inactive := false
	updated, err := service.UpdateCategory(t.Context(), admin(), category.PublicID, CategoryInput{Title: "Comedy and satire", Description: "Stand-up and sketches.", ImageAssetID: "asset-id", Active: &inactive, SortOrder: 4, Revision: category.Revision})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Slug != "comedy" || updated.Active || updated.Revision != 2 || updated.ImageAssetID != "asset-id" {
		t.Fatalf("updated=%+v", updated)
	}
	if _, err = service.UpdateCategory(t.Context(), admin(), category.PublicID, CategoryInput{Title: "Stale", Revision: 1}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale err=%v", err)
	}
}
func TestReadyIsRequiredBeforePublish(t *testing.T) {
	service, _, provider := testService(t)
	item, _, err := service.CreateUpload(context.Background(), admin(), validInput())
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.Publish(context.Background(), admin(), item.PublicID, true, item.Revision); !errors.Is(err, ErrConflict) {
		t.Fatalf("publish err=%v", err)
	}
	provider.status = StatusReady
	item, err = service.Synchronize(context.Background(), admin(), item.PublicID)
	if err != nil {
		t.Fatal(err)
	}
	item, err = service.Publish(context.Background(), admin(), item.PublicID, true, item.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if !item.Published || item.PublishedAt == nil {
		t.Fatal("ready video not published")
	}
}
func TestWebhookSignatureAndReplayAreIdempotent(t *testing.T) {
	service, repository, _ := testService(t)
	item, _, err := service.CreateUpload(context.Background(), admin(), validInput())
	if err != nil {
		t.Fatal(err)
	}
	raw := []byte("{\"VideoLibraryId\":42,\"VideoGuid\":\"provider-guid\",\"Status\":3}")
	mac := hmac.New(sha256.New, []byte("secret"))
	_, _ = mac.Write(raw)
	headers := map[string]string{"version": "v1", "algorithm": "hmac-sha256", "signature": hex.EncodeToString(mac.Sum(nil))}
	if err = service.ApplyWebhook(context.Background(), raw, headers, "secret"); err != nil {
		t.Fatal(err)
	}
	if err = service.ApplyWebhook(context.Background(), raw, headers, "secret"); err != nil {
		t.Fatalf("replay should succeed: %v", err)
	}
	stored, err := repository.Get(context.Background(), item.PublicID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != StatusReady || stored.Revision != 2 {
		t.Fatalf("stored=%+v", stored)
	}
}
func TestWebhookRejectsTampering(t *testing.T) {
	service, _, _ := testService(t)
	raw := []byte("{\"VideoLibraryId\":42,\"VideoGuid\":\"provider-guid\",\"Status\":3}")
	err := service.ApplyWebhook(context.Background(), raw, map[string]string{"version": "v1", "algorithm": "hmac-sha256", "signature": string(make([]byte, 64))}, "secret")
	if !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("err=%v", err)
	}
}

func TestInformationalWebhookDoesNotRegressReadyVideo(t *testing.T) {
	service, repository, provider := testService(t)
	item, _, err := service.CreateUpload(context.Background(), admin(), validInput())
	if err != nil {
		t.Fatal(err)
	}
	provider.status = StatusReady
	item, err = service.Synchronize(context.Background(), admin(), item.PublicID)
	if err != nil {
		t.Fatal(err)
	}
	raw := []byte("{\"VideoLibraryId\":42,\"VideoGuid\":\"provider-guid\",\"Status\":9}")
	mac := hmac.New(sha256.New, []byte("secret"))
	_, _ = mac.Write(raw)
	headers := map[string]string{"version": "v1", "algorithm": "hmac-sha256", "signature": hex.EncodeToString(mac.Sum(nil))}
	if err = service.ApplyWebhook(context.Background(), raw, headers, "secret"); err != nil {
		t.Fatal(err)
	}
	stored, err := repository.Get(context.Background(), item.PublicID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != StatusReady || stored.Revision != item.Revision {
		t.Fatalf("informational webhook regressed item=%+v", stored)
	}
}

func TestWebhookRejectsUnknownProviderStatus(t *testing.T) {
	service, _, _ := testService(t)
	raw := []byte("{\"VideoLibraryId\":42,\"VideoGuid\":\"provider-guid\",\"Status\":99}")
	mac := hmac.New(sha256.New, []byte("secret"))
	_, _ = mac.Write(raw)
	headers := map[string]string{"version": "v1", "algorithm": "hmac-sha256", "signature": hex.EncodeToString(mac.Sum(nil))}
	if err := service.ApplyWebhook(context.Background(), raw, headers, "secret"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("err=%v", err)
	}
}
func TestDeleteRemovesProviderAssetAndTombstonesRecord(t *testing.T) {
	service, repository, provider := testService(t)
	item, _, err := service.CreateUpload(context.Background(), admin(), validInput())
	if err != nil {
		t.Fatal(err)
	}
	if err = service.Delete(context.Background(), admin(), item.PublicID, item.Revision); err != nil {
		t.Fatal(err)
	}
	if !provider.deleted {
		t.Fatal("provider delete not called")
	}
	stored, err := repository.Get(context.Background(), item.PublicID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != StatusDeleted {
		t.Fatalf("status=%s", stored.Status)
	}
}
