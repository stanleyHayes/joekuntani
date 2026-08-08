package media

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Policy struct {
	Folders, MIME       map[string]bool
	Transforms, Hosts   map[string]bool
	FolderPrefix        string
	MaxBytes            int64
	MaxWidth, MaxHeight int
}

type Service struct {
	repository Repository
	provider   Provider
	policy     Policy
	now        func() time.Time
}

func NewService(repository Repository, provider Provider, policy Policy, now func() time.Time) (*Service, error) {
	policy.FolderPrefix = strings.Trim(strings.TrimSpace(policy.FolderPrefix), "/")
	if repository == nil || provider == nil || policy.FolderPrefix == "" || len(policy.Folders) == 0 || len(policy.MIME) == 0 || policy.MaxBytes <= 0 || policy.MaxWidth <= 0 || policy.MaxHeight <= 0 {
		return nil, fmt.Errorf("%w: incomplete media configuration", ErrInvalid)
	}
	if now == nil {
		now = time.Now
	}
	return &Service{repository: repository, provider: provider, policy: policy, now: now}, nil
}

func (service *Service) RequestUpload(ctx context.Context, actor Actor, input UploadRequest) (Asset, SignedUpload, error) {
	if !actor.CanEditContent {
		return Asset{}, SignedUpload{}, ErrForbidden
	}
	input.Filename = strings.TrimSpace(filepath.Base(input.Filename))
	input.Folder, input.MIMEType = strings.Trim(strings.TrimSpace(input.Folder), "/"), strings.ToLower(strings.TrimSpace(input.MIMEType))
	input.AltText = strings.TrimSpace(input.AltText)
	if err := service.validate(input); err != nil {
		return Asset{}, SignedUpload{}, err
	}
	input.Folder = path.Join(service.policy.FolderPrefix, input.Folder)
	now := service.now().UTC()
	publicID, err := newUUID()
	if err != nil {
		return Asset{}, SignedUpload{}, err
	}
	internalID, err := newID()
	if err != nil {
		return Asset{}, SignedUpload{}, err
	}
	asset := Asset{ID: internalID, PublicID: publicID, Filename: input.Filename, MIMEType: input.MIMEType, Folder: input.Folder, AltText: input.AltText, Tags: cleanSet(input.Tags), Transformations: cleanSet(input.Transformations), Bytes: input.Bytes, Width: input.Width, Height: input.Height, Status: StatusDraft, UploadedBy: actor.ID, CreatedAt: now, UpdatedAt: now}
	if err := service.repository.CreateDraftWithAudit(ctx, asset, service.audit(actor, "media.upload.request", asset.PublicID, "draft_saved")); err != nil {
		return Asset{}, SignedUpload{}, err
	}
	signed, err := service.provider.SignUpload(ctx, asset)
	if err != nil {
		return asset, SignedUpload{}, fmt.Errorf("%w: draft %s preserved", ErrProviderUnavailable, asset.PublicID)
	}
	if err := service.repository.MarkUploading(ctx, asset.PublicID, service.audit(actor, "media.upload.signed", asset.PublicID, "accepted")); err != nil {
		return asset, SignedUpload{}, err
	}
	asset.Status = StatusUploading
	return asset, signed, nil
}

func (service *Service) RetryUpload(ctx context.Context, actor Actor, assetID string) (Asset, SignedUpload, error) {
	if !actor.CanEditContent {
		return Asset{}, SignedUpload{}, ErrForbidden
	}
	asset, err := service.repository.Get(ctx, assetID)
	if err != nil {
		return Asset{}, SignedUpload{}, err
	}
	if asset.Status != StatusDraft && asset.Status != StatusFailed && asset.Status != StatusUploading {
		return Asset{}, SignedUpload{}, ErrConflict
	}
	signed, err := service.provider.SignUpload(ctx, asset)
	if err != nil {
		return asset, SignedUpload{}, fmt.Errorf("%w: draft %s preserved", ErrProviderUnavailable, asset.PublicID)
	}
	if err = service.repository.MarkUploading(ctx, asset.PublicID, service.audit(actor, "media.upload.retry", asset.PublicID, "accepted")); err != nil {
		return asset, SignedUpload{}, err
	}
	asset.Status = StatusUploading
	return asset, signed, nil
}

func (service *Service) CompleteUpload(ctx context.Context, body []byte, headers map[string]string) (Asset, error) {
	completion, err := service.provider.VerifyCompletion(ctx, body, headers)
	if err != nil {
		return Asset{}, err
	}
	return service.finishUpload(ctx, completion, headers["event-id"])
}

// ConfirmUpload completes an asset from the reply the browser received from the
// provider, for when the provider's callback never arrives. A local API has no
// public hostname for the callback to reach, so without this every upload made
// in development stayed at StatusUploading forever and no chosen image was ever
// publishable; dropped callbacks strand assets the same way in production.
//
// The payload is relayed by the client but not trusted on its word: the provider
// signs its reply, and VerifyUploadResponse rejects anything that does not carry
// that signature. Completion is idempotent, so a confirm racing a late callback
// settles on the same asset.
func (service *Service) ConfirmUpload(ctx context.Context, actor Actor, assetID string, body []byte) (Asset, error) {
	if !actor.CanEditContent {
		return Asset{}, ErrForbidden
	}
	verifier, ok := service.provider.(UploadResponseVerifier)
	if !ok {
		return Asset{}, ErrProviderUnavailable
	}
	completion, err := verifier.VerifyUploadResponse(ctx, body)
	if err != nil {
		return Asset{}, err
	}
	// The signature proves the provider produced this reply, not that it belongs
	// to the asset the caller named — bind them so a valid reply cannot be
	// replayed against a different draft.
	if completion.AssetID != assetID {
		return Asset{}, ErrInvalid
	}
	return service.finishUpload(ctx, completion, "confirm:"+completion.StorageKey+":"+completion.ProviderVersion)
}

func (service *Service) finishUpload(ctx context.Context, completion Completion, eventID string) (Asset, error) {
	asset, err := service.repository.Get(ctx, completion.AssetID)
	if err != nil {
		return Asset{}, err
	}
	if asset.Status != StatusUploading && asset.Status != StatusReady {
		return Asset{}, ErrConflict
	}
	if err := service.validateCompletion(asset, completion); err != nil {
		_ = service.repository.MarkFailed(ctx, asset.PublicID, service.now().UTC(), AuditEvent{Action: "media.upload.complete", AssetID: asset.PublicID, Outcome: "rejected", CreatedAt: service.now().UTC()})
		return Asset{}, err
	}
	return service.repository.Complete(ctx, completion, eventID, service.now().UTC(), AuditEvent{Action: "media.upload.complete", AssetID: asset.PublicID, Outcome: "accepted", CreatedAt: service.now().UTC()})
}

func (service *Service) UpdateMetadata(ctx context.Context, actor Actor, assetID, alt string, tags, transforms []string) (Asset, error) {
	if !actor.CanEditContent {
		return Asset{}, ErrForbidden
	}
	asset, err := service.repository.Get(ctx, assetID)
	if err != nil {
		return Asset{}, err
	}
	alt = strings.TrimSpace(alt)
	transforms = cleanSet(transforms)
	tags = cleanSet(tags)
	if !validMetadata(alt, asset.Filename, tags, transforms) || !allAllowed(transforms, service.policy.Transforms) {
		return Asset{}, ErrInvalid
	}
	return service.repository.UpdateMetadata(ctx, assetID, alt, tags, transforms, service.now().UTC(), service.audit(actor, "media.metadata.update", assetID, "accepted"))
}

func (service *Service) Delete(ctx context.Context, actor Actor, assetID string) error {
	if !actor.CanEditContent {
		return ErrForbidden
	}
	asset, err := service.repository.Get(ctx, assetID)
	if err != nil {
		return err
	}
	previousStatus := asset.Status
	if previousStatus == StatusDeleting {
		previousStatus = StatusReady
	} else if err = service.repository.PrepareDelete(ctx, assetID, service.now().UTC()); err != nil {
		return err
	}
	if asset.Status != StatusDraft {
		if err := service.provider.Delete(ctx, asset); err != nil {
			_ = service.repository.RestoreDelete(ctx, assetID, previousStatus, service.now().UTC(), service.audit(actor, "media.delete", assetID, "provider_failed"))
			return fmt.Errorf("%w: deletion not committed", ErrProviderUnavailable)
		}
	}
	return service.repository.Delete(ctx, assetID, service.now().UTC(), service.audit(actor, "media.delete", assetID, "accepted"))
}

func (service *Service) AddReference(ctx context.Context, actor Actor, reference UsageReference) error {
	if !actor.CanEditContent {
		return ErrForbidden
	}
	if strings.TrimSpace(reference.AssetID) == "" || strings.TrimSpace(reference.EntityType) == "" || strings.TrimSpace(reference.EntityID) == "" || strings.TrimSpace(reference.Field) == "" {
		return ErrInvalid
	}
	reference.CreatedAt = service.now().UTC()
	return service.repository.AddReference(ctx, reference, service.audit(actor, "media.reference.add", reference.AssetID, "accepted"))
}

func (service *Service) RemoveReference(ctx context.Context, actor Actor, reference UsageReference) error {
	if !actor.CanEditContent {
		return ErrForbidden
	}
	return service.repository.RemoveReference(ctx, reference, service.audit(actor, "media.reference.remove", reference.AssetID, "accepted"))
}

func (service *Service) Get(ctx context.Context, actor Actor, id string) (Asset, error) {
	if !actor.CanEditContent {
		return Asset{}, ErrForbidden
	}
	return service.repository.Get(ctx, id)
}

// PublicAsset resolves an asset id for an unauthenticated reader.
//
// The public site stores only asset ids on its content — a page's gallery is a
// list of uuids — so without this every CMS image resolved to nothing and no
// picture was ever rendered, on any page or social card.
//
// Only a `ready` asset is visible. A draft, failed or deleted asset has either
// no file behind it or one that was withdrawn, and neither should be reachable
// without a session.
func (service *Service) PublicAsset(ctx context.Context, id string) (Asset, error) {
	asset, err := service.repository.Get(ctx, id)
	if err != nil {
		return Asset{}, err
	}
	if asset.Status != StatusReady {
		return Asset{}, ErrNotFound
	}
	return asset, nil
}
func (service *Service) List(ctx context.Context, actor Actor) ([]Asset, error) {
	if !actor.CanEditContent {
		return nil, ErrForbidden
	}
	return service.repository.List(ctx)
}
func (service *Service) UsageCount(ctx context.Context, actor Actor, id string) (int, error) {
	if !actor.CanEditContent {
		return 0, ErrForbidden
	}
	references, err := service.repository.References(ctx, id)
	return len(references), err
}

func (service *Service) validate(input UploadRequest) error {
	tags, transforms := cleanSet(input.Tags), cleanSet(input.Transformations)
	invalidDimensions := strings.HasPrefix(input.MIMEType, "image/") && (input.Width <= 0 || input.Width > service.policy.MaxWidth || input.Height <= 0 || input.Height > service.policy.MaxHeight)
	if input.Filename == "" || len(input.Filename) > 255 || !service.policy.Folders[input.Folder] || !service.policy.MIME[input.MIMEType] || input.Bytes <= 0 || input.Bytes > service.policy.MaxBytes || invalidDimensions || !validMetadata(input.AltText, input.Filename, tags, transforms) || !allAllowed(transforms, service.policy.Transforms) {
		return ErrInvalid
	}
	return nil
}
func (service *Service) validateCompletion(asset Asset, completion Completion) error {
	parsed, err := url.Parse(completion.PublicURL)
	invalidDimensions := strings.HasPrefix(completion.MIMEType, "image/") && (completion.Width <= 0 || completion.Width > service.policy.MaxWidth || completion.Height <= 0 || completion.Height > service.policy.MaxHeight)
	if err != nil || parsed.Scheme != "https" || !service.policy.Hosts[strings.ToLower(parsed.Hostname())] || completion.AssetID != asset.PublicID || completion.MIMEType != asset.MIMEType || completion.Bytes <= 0 || completion.Bytes > service.policy.MaxBytes || invalidDimensions || !strings.HasPrefix(completion.StorageKey, asset.Folder+"/") {
		return ErrInvalid
	}
	return nil
}
func meaningfulAlt(alt, filename string) bool {
	normalized := strings.ToLower(strings.TrimSpace(alt))
	base := strings.ToLower(strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename)))
	return len([]rune(normalized)) >= 8 && normalized != base && normalized != "image" && normalized != "photo"
}
func validMetadata(alt, filename string, tags, transforms []string) bool {
	if !meaningfulAlt(alt, filename) || len([]rune(alt)) > 500 || len(tags) > 50 || len(transforms) > 10 {
		return false
	}
	for _, tag := range tags {
		if len([]rune(tag)) > 80 {
			return false
		}
	}
	return true
}
func cleanSet(values []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, value := range values {
		value = strings.ToLower(strings.TrimSpace(value))
		if value != "" && !seen[value] {
			seen[value] = true
			out = append(out, value)
		}
	}
	sort.Strings(out)
	return out
}
func allAllowed(values []string, allowed map[string]bool) bool {
	for _, value := range values {
		if !allowed[value] {
			return false
		}
	}
	return true
}
func (service *Service) audit(actor Actor, action, asset, outcome string) AuditEvent {
	return AuditEvent{ActorID: actor.ID, Action: action, AssetID: asset, Outcome: outcome, CreatedAt: service.now().UTC()}
}
func newID() (string, error) {
	value := make([]byte, 12)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}
func newUUID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(value)
	return fmt.Sprintf("%s-%s-%s-%s-%s", encoded[:8], encoded[8:12], encoded[12:16], encoded[16:20], encoded[20:]), nil
}
