package media

import (
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"
)

var fixedTime = time.Date(2026, 8, 5, 14, 30, 0, 0, time.UTC)

func testPolicy() Policy {
	return Policy{FolderPrefix: "staging", Folders: map[string]bool{"content": true}, MIME: map[string]bool{"image/jpeg": true, "image/png": true}, Transforms: map[string]bool{"card": true, "hero": true}, Hosts: map[string]bool{"res.cloudinary.com": true}, MaxBytes: 5 << 20, MaxWidth: 5000, MaxHeight: 5000}
}
func testProvider(t *testing.T) (*Cloudinary, func(Completion, string) ([]byte, map[string]string)) {
	t.Helper()
	p, err := NewCloudinary(CloudinaryConfig{CloudName: "test", APIKey: "public-key", APISecret: "api-secret", WebhookSecret: "hook-secret"}, func() time.Time { return fixedTime }, func(context.Context, string) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	sign := func(c Completion, event string) ([]byte, map[string]string) {
		format := "jpg"
		resourceType := "image"
		if c.MIMEType == "application/pdf" {
			format = "pdf"
		}
		version, _ := strconv.ParseInt(c.ProviderVersion, 10, 64)
		if version == 0 {
			version = 1
		}
		body, _ := json.Marshal(map[string]any{"public_id": c.StorageKey, "secure_url": c.PublicURL, "resource_type": resourceType, "format": format, "bytes": c.Bytes, "width": c.Width, "height": c.Height, "version": version})
		timestamp := strconv.FormatInt(fixedTime.Unix(), 10)
		digest := sha1.Sum(append(append(append([]byte(nil), body...), timestamp...), "api-secret"...))
		return body, map[string]string{"timestamp": timestamp, "event-id": event, "signature": hex.EncodeToString(digest[:])}
	}
	return p, sign
}

func TestCloudinaryAcceptsOfficialNotificationSignatureVector(t *testing.T) {
	// Cloudinary's published manual-verification vector is intentionally kept
	// literal so this test cannot reproduce the implementation's algorithm.
	provider, err := NewCloudinary(
		CloudinaryConfig{CloudName: "test", APIKey: "public-key", APISecret: "abcd", WebhookSecret: "unused", CallbackSkew: time.Hour},
		func() time.Time { return time.Unix(1315060510, 0) },
		func(context.Context, string) error { return nil },
	)
	if err != nil {
		t.Fatal(err)
	}
	_, err = provider.VerifyCompletion(context.Background(), []byte("{public_id: 'sample'}"), map[string]string{
		"timestamp": "1315060510",
		"signature": "25f7e91709c858b97d688ce8da799dedb290d9ef",
	})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("official signature vector was rejected before payload decoding: %v", err)
	}
}
func validUpload() UploadRequest {
	return UploadRequest{Filename: "stage-performance.jpg", MIMEType: "image/jpeg", Folder: "content", AltText: "Joe performing under warm stage lights", Tags: []string{"Stage", "stage"}, Transformations: []string{"hero"}, Bytes: 1024, Width: 1600, Height: 900}
}
func setup(t *testing.T) (*Service, *MemoryRepository, *Cloudinary) {
	t.Helper()
	repo := NewMemoryRepository()
	provider, _ := testProvider(t)
	service, err := NewService(repo, provider, testPolicy(), func() time.Time { return fixedTime })
	if err != nil {
		t.Fatal(err)
	}
	return service, repo, provider
}

func TestRequestUploadUsesAllowlistsAndPreservesDraftOnProviderFailure(t *testing.T) {
	service, repo, provider := setup(t)
	actor := Actor{ID: "actor-internal", CanEditContent: true}
	asset, signed, err := service.RequestUpload(context.Background(), actor, validUpload())
	if err != nil || signed.APIKey != "public-key" || signed.Signature == "" || asset.Status != StatusUploading {
		t.Fatalf("unexpected result: %#v %#v %v", asset, signed, err)
	}
	bad := validUpload()
	bad.MIMEType = "text/html"
	if _, _, err = service.RequestUpload(context.Background(), actor, bad); !errors.Is(err, ErrInvalid) {
		t.Fatalf("wanted invalid, got %v", err)
	}
	failing := &stubProvider{signErr: errors.New("offline")}
	fallback, _ := NewService(repo, failing, testPolicy(), func() time.Time { return fixedTime })
	draft, _, err := fallback.RequestUpload(context.Background(), actor, validUpload())
	if !errors.Is(err, ErrProviderUnavailable) || draft.Status != StatusDraft {
		t.Fatalf("draft not preserved: %#v %v", draft, err)
	}
	fallback.provider = provider
	retried, retrySigned, err := fallback.RetryUpload(context.Background(), actor, draft.PublicID)
	if err != nil || retried.Status != StatusUploading || retrySigned.Signature == "" {
		t.Fatalf("draft retry failed: %#v %v", retried, err)
	}
	if _, _, err = fallback.RetryUpload(context.Background(), actor, draft.PublicID); err != nil {
		t.Fatalf("idempotent uploading retry failed: %v", err)
	}
}
func TestCompletionVerifiesSignatureHostDimensionsAndRejectsReplay(t *testing.T) {
	service, _, _ := setup(t)
	actor := Actor{ID: "actor", CanEditContent: true}
	asset, _, _ := service.RequestUpload(context.Background(), actor, validUpload())
	_, sign := testProvider(t)
	completion := Completion{AssetID: asset.PublicID, StorageKey: "staging/content/" + asset.PublicID, PublicURL: "https://res.cloudinary.com/test/image/upload/x.jpg", MIMEType: "image/jpeg", Bytes: 1024, Width: 1600, Height: 900, ProviderVersion: "v1"}
	body, headers := sign(completion, "evt-1")
	ready, err := service.CompleteUpload(context.Background(), body, headers)
	if err != nil || ready.Status != StatusReady {
		t.Fatalf("complete failed: %#v %v", ready, err)
	}
	if _, err = service.CompleteUpload(context.Background(), body, headers); !errors.Is(err, ErrReplay) {
		t.Fatalf("wanted replay, got %v", err)
	}
	completion.PublicURL = "https://attacker.example/file.jpg"
	body, headers = sign(completion, "evt-2")
	if _, err = service.CompleteUpload(context.Background(), body, headers); !errors.Is(err, ErrInvalid) {
		t.Fatalf("wanted invalid host, got %v", err)
	}
	headers["signature"] = "00"
	if _, err = service.CompleteUpload(context.Background(), body, headers); !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("wanted invalid signature, got %v", err)
	}
}
func TestMetadataReferencesDeletionAndAuditFailClosed(t *testing.T) {
	service, repo, _ := setup(t)
	actor := Actor{ID: "actor", CanEditContent: true}
	asset, _, _ := service.RequestUpload(context.Background(), actor, validUpload())
	updated, err := service.UpdateMetadata(context.Background(), actor, asset.PublicID, "Joe smiling backstage before the performance", []string{"Portrait"}, []string{"card"})
	if err != nil || updated.Tags[0] != "portrait" {
		t.Fatalf("metadata: %#v %v", updated, err)
	}
	ref := UsageReference{AssetID: asset.PublicID, EntityType: "page", EntityID: "page-public-id", Field: "hero"}
	if err = service.AddReference(context.Background(), actor, ref); err != nil {
		t.Fatal(err)
	}
	if err = service.Delete(context.Background(), actor, asset.PublicID); !errors.Is(err, ErrReferenced) {
		t.Fatalf("wanted protected delete: %v", err)
	}
	if err = service.RemoveReference(context.Background(), actor, ref); err != nil {
		t.Fatal(err)
	}
	repo.FailAudit = true
	if _, err = service.UpdateMetadata(context.Background(), actor, asset.PublicID, "Joe smiling backstage before the performance", nil, nil); !errors.Is(err, ErrAuditUnavailable) {
		t.Fatalf("wanted audit failure: %v", err)
	}
	current, _ := repo.Get(context.Background(), asset.PublicID)
	if current.AltText != updated.AltText {
		t.Fatal("mutation committed without audit")
	}
	repo.FailAudit = false
	if err = service.Delete(context.Background(), actor, asset.PublicID); err != nil {
		t.Fatal(err)
	}
}
func TestRBACAndMeaningfulAlt(t *testing.T) {
	service, _, _ := setup(t)
	if _, _, err := service.RequestUpload(context.Background(), Actor{}, validUpload()); !errors.Is(err, ErrForbidden) {
		t.Fatal(err)
	}
	input := validUpload()
	input.AltText = "stage-performance"
	if _, _, err := service.RequestUpload(context.Background(), Actor{CanEditContent: true}, input); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
}
func TestProviderDeleteFailureRestoresAssetAndReferencesStayFrozen(t *testing.T) {
	service, repo, _ := setup(t)
	actor := Actor{ID: "actor", CanEditContent: true}
	asset, _, _ := service.RequestUpload(context.Background(), actor, validUpload())
	service.provider = &stubProvider{deleteErr: errors.New("offline")}
	if err := service.Delete(context.Background(), actor, asset.PublicID); !errors.Is(err, ErrProviderUnavailable) {
		t.Fatalf("wanted provider failure, got %v", err)
	}
	current, _ := repo.Get(context.Background(), asset.PublicID)
	if current.Status != StatusUploading {
		t.Fatalf("status not restored: %s", current.Status)
	}
}

func TestCallbackCannotResurrectAssetWhileProviderDeleteIsInFlight(t *testing.T) {
	service, repo, cloudinary := setup(t)
	actor := Actor{ID: "actor", CanEditContent: true}
	asset, _, err := service.RequestUpload(context.Background(), actor, validUpload())
	if err != nil {
		t.Fatal(err)
	}
	completion := Completion{AssetID: asset.PublicID, StorageKey: "staging/content/" + asset.PublicID, PublicURL: "https://res.cloudinary.com/test/image/upload/race.jpg", MIMEType: "image/jpeg", ProviderVersion: "1", Bytes: 1024, Width: 1600, Height: 900}
	_, sign := testProvider(t)
	body, headers := sign(completion, "callback-during-delete")
	deleteStarted := make(chan struct{})
	releaseDelete := make(chan struct{})
	service.provider = &blockingDeleteProvider{Cloudinary: cloudinary, started: deleteStarted, release: releaseDelete}
	deleteResult := make(chan error, 1)
	go func() { deleteResult <- service.Delete(context.Background(), actor, asset.PublicID) }()
	<-deleteStarted // PrepareDelete has committed StatusDeleting before provider deletion starts.
	if _, err = service.CompleteUpload(context.Background(), body, headers); !errors.Is(err, ErrConflict) {
		t.Fatalf("callback during deletion should conflict, got %v", err)
	}
	if len(repo.callbacks) != 0 {
		t.Fatal("rejected callback was incorrectly claimed as processed")
	}
	close(releaseDelete)
	if err = <-deleteResult; err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if _, err = repo.Get(context.Background(), asset.PublicID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted asset was resurrected: %v", err)
	}
}

func TestReadyCompletionIsIdempotentOnlyForIdenticalProviderPayload(t *testing.T) {
	service, _, _ := setup(t)
	actor := Actor{ID: "actor", CanEditContent: true}
	asset, _, err := service.RequestUpload(context.Background(), actor, validUpload())
	if err != nil {
		t.Fatal(err)
	}
	completion := Completion{AssetID: asset.PublicID, StorageKey: "staging/content/" + asset.PublicID, PublicURL: "https://res.cloudinary.com/test/image/upload/idempotent.jpg", MIMEType: "image/jpeg", ProviderVersion: "1", Bytes: 1024, Width: 1600, Height: 900}
	_, sign := testProvider(t)
	body, headers := sign(completion, "first-delivery")
	if _, err = service.CompleteUpload(context.Background(), body, headers); err != nil {
		t.Fatal(err)
	}
	body, headers = sign(completion, "redelivery-with-new-identity")
	if _, err = service.CompleteUpload(context.Background(), body, headers); err != nil {
		t.Fatalf("identical ready redelivery should be idempotent: %v", err)
	}
	completion.ProviderVersion = "2"
	body, headers = sign(completion, "conflicting-version")
	if _, err = service.CompleteUpload(context.Background(), body, headers); !errors.Is(err, ErrConflict) {
		t.Fatalf("different provider payload should conflict, got %v", err)
	}
}

func TestCloudinaryUsesCanonicalSignaturesAndSignedDestroy(t *testing.T) {
	provider, _ := testProvider(t)
	asset := Asset{PublicID: "asset-id", Folder: "staging/content", Tags: []string{"portrait"}, StorageKey: "staging/content/asset-id"}
	signed, err := provider.SignUpload(context.Background(), asset)
	if err != nil {
		t.Fatal(err)
	}
	canonical := "folder=staging/content&public_id=asset-id&tags=portrait&timestamp=" + strconv.FormatInt(fixedTime.Unix(), 10) + "api-secret"
	digest := sha256.Sum256([]byte(canonical))
	if signed.Signature != hex.EncodeToString(digest[:]) {
		t.Fatalf("non-canonical signature %s", signed.Signature)
	}
	provider.delete = provider.destroy
	provider.client = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Host != "api.cloudinary.com" || request.URL.Path != "/v1_1/test/image/destroy" {
			t.Fatalf("unexpected endpoint %s", request.URL)
		}
		body, _ := io.ReadAll(request.Body)
		values, _ := url.ParseQuery(string(body))
		if values.Get("api_key") != "public-key" || values.Get("public_id") != asset.StorageKey || values.Get("signature") == "" {
			t.Fatalf("unsafe destroy form %s", body)
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"result":"ok"}`)), Header: make(http.Header)}, nil
	})}
	if err = provider.Delete(context.Background(), asset); err != nil {
		t.Fatal(err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

type stubProvider struct{ signErr, deleteErr error }

func (s *stubProvider) SignUpload(context.Context, Asset) (SignedUpload, error) {
	return SignedUpload{}, s.signErr
}
func (s *stubProvider) VerifyCompletion(context.Context, []byte, map[string]string) (Completion, error) {
	return Completion{}, ErrProviderUnavailable
}
func (s *stubProvider) Delete(context.Context, Asset) error { return s.deleteErr }

type blockingDeleteProvider struct {
	*Cloudinary
	started chan struct{}
	release chan struct{}
}

func (provider *blockingDeleteProvider) Delete(context.Context, Asset) error {
	close(provider.started)
	<-provider.release
	return nil
}
