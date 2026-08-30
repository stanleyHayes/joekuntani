package video

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type Service struct {
	repository Repository
	provider   Provider
	config     Config
	now        func() time.Time
}

func NewService(repository Repository, provider Provider, config Config, now func() time.Time) (*Service, error) {
	if repository == nil || provider == nil {
		return nil, ErrInvalid
	}
	if now == nil {
		now = time.Now
	}
	return &Service{repository: repository, provider: provider, config: config, now: now}, nil
}

func (service *Service) CreateUpload(ctx context.Context, actor Actor, input CreateInput) (Item, UploadAuthorization, error) {
	if !actor.CanManage || actor.ID == "" {
		return Item{}, UploadAuthorization{}, ErrForbidden
	}
	input = normalizeCreate(input)
	if err := service.validateCreate(input); err != nil {
		return Item{}, UploadAuthorization{}, err
	}
	providerVideo, err := service.provider.Create(ctx, input.Title)
	if err != nil {
		return Item{}, UploadAuthorization{}, err
	}
	now := service.now().UTC()
	item := Item{
		PublicID: newPublicID(), Slug: input.Slug, Title: input.Title, Description: input.Description,
		Category: input.Category, Tags: input.Tags, Provider: service.provider.Name(),
		ProviderVideoID: providerVideo.ID, ProviderLibraryID: providerVideo.LibraryID,
		ThumbnailURL: providerVideo.ThumbnailURL, DurationSeconds: providerVideo.DurationSeconds,
		Status: StatusUploading, Visibility: input.Visibility, SortOrder: input.SortOrder,
		Filename: input.Filename, MIMEType: input.MIMEType, Bytes: input.Bytes, AspectRatio: input.AspectRatio,
		Revision: 1, CreatedBy: actor.ID, CreatedAt: now, UpdatedAt: now,
	}
	if err := service.repository.Create(ctx, item); err != nil {
		_ = service.provider.Delete(ctx, providerVideo.ID)
		return Item{}, UploadAuthorization{}, err
	}
	authorization, err := service.provider.UploadAuthorization(providerVideo.ID, input.Filename, input.MIMEType, now.Add(service.config.UploadTTL))
	if err != nil {
		item.Status, item.FailureReason, item.UpdatedAt = StatusFailed, "upload authorization could not be created", now
		_, _ = service.repository.Update(ctx, item, item.Revision)
		return item, UploadAuthorization{}, err
	}
	return item, authorization, nil
}

// CreateLink records a video already published on a social platform. It is
// ready immediately because there is no local upload or encoding bill to wait
// for; publication is still a separate, audited operator decision.
func (service *Service) CreateLink(ctx context.Context, actor Actor, input CreateLinkInput) (Item, PlaybackInfo, error) {
	if !actor.CanManage || actor.ID == "" {
		return Item{}, PlaybackInfo{}, ErrForbidden
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Slug = strings.ToLower(strings.TrimSpace(input.Slug))
	input.Description = strings.TrimSpace(input.Description)
	input.Category = strings.TrimSpace(input.Category)
	input.SourceURL = strings.TrimSpace(input.SourceURL)
	input.Tags = normalizeTags(input.Tags)
	input.AspectRatio = strings.TrimSpace(input.AspectRatio)
	if input.Visibility == "" {
		input.Visibility = VisibilityPrivate
	}
	platform, sourceID, sourceURL, playback, defaultRatio, err := socialVideo(input.SourceURL)
	if err != nil || input.Title == "" || len(input.Title) > 180 || !slugPattern.MatchString(input.Slug) || len(input.Slug) > 180 || len(input.Description) > 5000 || len(input.Category) > 100 || len(input.Tags) > 20 || !validVisibility(input.Visibility) || !validAspectRatio(input.AspectRatio) {
		return Item{}, PlaybackInfo{}, ErrInvalid
	}
	if input.AspectRatio == "" {
		input.AspectRatio = defaultRatio
	}
	now := service.now().UTC()
	item := Item{
		PublicID: newPublicID(), Slug: input.Slug, Title: input.Title,
		Description: input.Description, Category: input.Category, Tags: input.Tags,
		Provider: "external", Platform: platform, SourceURL: sourceURL,
		ProviderVideoID: platform + ":" + sourceID, ThumbnailURL: playback.ThumbnailURL,
		AspectRatio: input.AspectRatio, Status: StatusReady, Visibility: input.Visibility,
		SortOrder: input.SortOrder, Revision: 1, CreatedBy: actor.ID,
		CreatedAt: now, UpdatedAt: now,
	}
	if err := service.repository.Create(ctx, item); err != nil {
		return Item{}, PlaybackInfo{}, err
	}
	return item, playback, nil
}

func socialVideo(raw string) (platform, sourceID, sourceURL string, playback PlaybackInfo, ratio string, err error) {
	parsed, parseErr := url.Parse(strings.TrimSpace(raw))
	if parseErr != nil || parsed.Scheme != "https" || parsed.User != nil {
		err = ErrInvalid
		return
	}
	host := strings.TrimPrefix(strings.ToLower(parsed.Hostname()), "www.")
	segments := strings.FieldsFunc(strings.Trim(parsed.Path, "/"), func(r rune) bool { return r == '/' })
	sourceURL = parsed.String()
	switch {
	case host == "youtu.be" && len(segments) > 0:
		platform, sourceID, ratio = "youtube", segments[0], "16:9"
	case (host == "youtube.com" || host == "m.youtube.com"):
		if len(segments) >= 2 && (segments[0] == "shorts" || segments[0] == "embed") {
			sourceID = segments[1]
		} else {
			sourceID = parsed.Query().Get("v")
		}
		platform, ratio = "youtube", "16:9"
		if len(segments) >= 2 && segments[0] == "shorts" {
			ratio = "9:16"
		}
	case host == "tiktok.com" || strings.HasSuffix(host, ".tiktok.com"):
		match := regexp.MustCompile(`/video/([0-9]+)`).FindStringSubmatch(parsed.Path)
		if len(match) == 2 {
			platform, sourceID, ratio = "tiktok", match[1], "9:16"
		}
	case host == "instagram.com" && len(segments) >= 2 && (segments[0] == "reel" || segments[0] == "p" || segments[0] == "tv"):
		platform, sourceID, ratio = "instagram", segments[1], "1:1"
		if segments[0] == "reel" {
			ratio = "9:16"
		}
		playback.EmbedURL = "https://www.instagram.com/" + segments[0] + "/" + sourceID + "/embed"
	case (host == "facebook.com" || host == "fb.watch"):
		platform, ratio = "facebook", "16:9"
		if len(segments) >= 2 && segments[0] == "reel" {
			sourceID, ratio = segments[1], "9:16"
		} else {
			sourceID = parsed.Query().Get("v")
			if sourceID == "" && len(segments) > 0 {
				sourceID = segments[len(segments)-1]
			}
		}
		playback.EmbedURL = "https://www.facebook.com/plugins/video.php?href=" + url.QueryEscape(sourceURL)
	case host == "vimeo.com" && len(segments) > 0:
		platform, sourceID, ratio = "vimeo", segments[len(segments)-1], "16:9"
	}
	if platform == "" || sourceID == "" || !regexp.MustCompile(`^[A-Za-z0-9_-]+$`).MatchString(sourceID) {
		err = ErrInvalid
		return
	}
	if playback.EmbedURL == "" {
		switch platform {
		case "youtube":
			playback.EmbedURL = "https://www.youtube-nocookie.com/embed/" + sourceID
			playback.ThumbnailURL = "https://i.ytimg.com/vi/" + sourceID + "/hqdefault.jpg"
		case "tiktok":
			playback.EmbedURL = "https://www.tiktok.com/player/v1/" + sourceID
		case "vimeo":
			playback.EmbedURL = "https://player.vimeo.com/video/" + sourceID
		}
	}
	return
}

func (service *Service) playbackFor(item Item) PlaybackInfo {
	if item.Provider == "external" && item.SourceURL != "" {
		_, _, _, playback, _, err := socialVideo(item.SourceURL)
		if err == nil {
			return playback
		}
	}
	return service.provider.Playback(item.ProviderVideoID)
}

func normalizeCreate(input CreateInput) CreateInput {
	input.Title = strings.TrimSpace(input.Title)
	input.Slug = strings.ToLower(strings.TrimSpace(input.Slug))
	input.Description = strings.TrimSpace(input.Description)
	input.Category = strings.TrimSpace(input.Category)
	input.Filename = filepath.Base(strings.TrimSpace(input.Filename))
	input.MIMEType = strings.ToLower(strings.TrimSpace(input.MIMEType))
	input.Tags = normalizeTags(input.Tags)
	input.AspectRatio = strings.TrimSpace(input.AspectRatio)
	if input.Visibility == "" {
		input.Visibility = VisibilityPrivate
	}
	return input
}

func (service *Service) validateCreate(input CreateInput) error {
	if !service.config.Enabled || input.Title == "" || len(input.Title) > 180 || !slugPattern.MatchString(input.Slug) || len(input.Slug) > 180 || input.Filename == "." || input.Filename == "" || input.Bytes < 1 || input.Bytes > service.config.MaxBytes || !service.config.AllowedMIMETypes[input.MIMEType] || !validVisibility(input.Visibility) || !validAspectRatio(input.AspectRatio) || len(input.Description) > 5000 || len(input.Category) > 100 || len(input.Tags) > 20 {
		return ErrInvalid
	}
	extension := strings.ToLower(filepath.Ext(input.Filename))
	allowedExtensions := map[string]bool{".mp4": true, ".webm": true, ".mov": true, ".mkv": true}
	if !allowedExtensions[extension] {
		return ErrInvalid
	}
	return nil
}

func (service *Service) List(ctx context.Context, actor Actor) ([]Item, error) {
	if !actor.CanManage {
		return nil, ErrForbidden
	}
	items, err := service.repository.List(ctx, false)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	return items, nil
}

func (service *Service) PublicList(ctx context.Context) ([]Item, error) {
	items, err := service.repository.List(ctx, true)
	if err != nil {
		return nil, err
	}
	result := make([]Item, 0, len(items))
	for _, item := range items {
		if item.Status == StatusReady && item.Published && item.Visibility == VisibilityPublic {
			result = append(result, item)
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].SortOrder != result[j].SortOrder {
			return result[i].SortOrder < result[j].SortOrder
		}
		return result[i].PublishedAt != nil && result[j].PublishedAt != nil && result[i].PublishedAt.After(*result[j].PublishedAt)
	})
	return result, nil
}

func (service *Service) Public(ctx context.Context, publicID string) (Item, PlaybackInfo, error) {
	item, err := service.repository.Get(ctx, publicID)
	if err != nil || item.Status != StatusReady || !item.Published || item.Visibility == VisibilityPrivate {
		return Item{}, PlaybackInfo{}, ErrNotFound
	}
	return item, service.playbackFor(item), nil
}

func (service *Service) ListCategories(ctx context.Context, actor Actor) ([]Category, error) {
	if !actor.CanManage {
		return nil, ErrForbidden
	}
	categories, err := service.repository.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(categories, func(i, j int) bool {
		if categories[i].SortOrder != categories[j].SortOrder {
			return categories[i].SortOrder < categories[j].SortOrder
		}
		return categories[i].Title < categories[j].Title
	})
	return categories, nil
}

func (service *Service) CreateCategory(ctx context.Context, actor Actor, input CategoryInput) (Category, error) {
	if !actor.CanManage || actor.ID == "" {
		return Category{}, ErrForbidden
	}
	title := strings.TrimSpace(input.Title)
	if title == "" || len(title) > 100 || len(strings.TrimSpace(input.Description)) > 500 || len(strings.TrimSpace(input.ImageAssetID)) > 100 {
		return Category{}, ErrInvalid
	}
	now := service.now().UTC()
	active := true
	if input.Active != nil {
		active = *input.Active
	}
	category := Category{PublicID: newPublicID(), Slug: categorySlug(title), Title: title, Description: strings.TrimSpace(input.Description), ImageAssetID: strings.TrimSpace(input.ImageAssetID), Active: active, SortOrder: input.SortOrder, Revision: 1, CreatedBy: actor.ID, CreatedAt: now, UpdatedAt: now}
	if category.Slug == "" {
		return Category{}, ErrInvalid
	}
	if err := service.repository.CreateCategory(ctx, category); err != nil {
		return Category{}, err
	}
	return category, nil
}

func (service *Service) UpdateCategory(ctx context.Context, actor Actor, publicID string, input CategoryInput) (Category, error) {
	if !actor.CanManage {
		return Category{}, ErrForbidden
	}
	category, err := service.repository.GetCategory(ctx, publicID)
	if err != nil {
		return Category{}, err
	}
	title := strings.TrimSpace(input.Title)
	if input.Revision < 1 || title == "" || len(title) > 100 || len(strings.TrimSpace(input.Description)) > 500 || len(strings.TrimSpace(input.ImageAssetID)) > 100 {
		return Category{}, ErrInvalid
	}
	category.Title, category.Description, category.ImageAssetID, category.SortOrder = title, strings.TrimSpace(input.Description), strings.TrimSpace(input.ImageAssetID), input.SortOrder
	if input.Active != nil {
		category.Active = *input.Active
	}
	category.UpdatedAt = service.now().UTC()
	return service.repository.UpdateCategory(ctx, category, input.Revision)
}

func categorySlug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(value, "-")
	return strings.Trim(value, "-")
}

func (service *Service) Update(ctx context.Context, actor Actor, publicID string, input UpdateInput) (Item, error) {
	if !actor.CanManage {
		return Item{}, ErrForbidden
	}
	item, err := service.repository.Get(ctx, publicID)
	if err != nil {
		return Item{}, err
	}
	input.Title, input.Description, input.Category = strings.TrimSpace(input.Title), strings.TrimSpace(input.Description), strings.TrimSpace(input.Category)
	input.Tags = normalizeTags(input.Tags)
	input.AspectRatio = strings.TrimSpace(input.AspectRatio)
	if input.Revision < 1 || input.Title == "" || len(input.Title) > 180 || len(input.Description) > 5000 || len(input.Category) > 100 || len(input.Tags) > 20 || !validVisibility(input.Visibility) || !validAspectRatio(input.AspectRatio) {
		return Item{}, ErrInvalid
	}
	item.Title, item.Description, item.Category, item.Tags, item.Visibility, item.SortOrder = input.Title, input.Description, input.Category, input.Tags, input.Visibility, input.SortOrder
	item.AspectRatio = input.AspectRatio
	item.UpdatedAt = service.now().UTC()
	return service.repository.Update(ctx, item, input.Revision)
}

func (service *Service) Synchronize(ctx context.Context, actor Actor, publicID string) (Item, error) {
	if !actor.CanManage {
		return Item{}, ErrForbidden
	}
	item, err := service.repository.Get(ctx, publicID)
	if err != nil {
		return Item{}, err
	}
	providerVideo, err := service.provider.Get(ctx, item.ProviderVideoID)
	if err != nil {
		return Item{}, err
	}
	return service.applyProviderState(ctx, item, providerVideo.Status, providerVideo.DurationSeconds, providerVideo.ThumbnailURL, providerVideo.Width, providerVideo.Height)
}

func (service *Service) Publish(ctx context.Context, actor Actor, publicID string, publish bool, revision int64) (Item, error) {
	if !actor.CanManage {
		return Item{}, ErrForbidden
	}
	item, err := service.repository.Get(ctx, publicID)
	if err != nil {
		return Item{}, err
	}
	if revision < 1 || item.Revision != revision || (publish && item.Status != StatusReady) || item.Status == StatusDeleted {
		return Item{}, ErrConflict
	}
	now := service.now().UTC()
	item.Published, item.UpdatedAt = publish, now
	if publish {
		item.PublishedAt = &now
	} else {
		item.PublishedAt = nil
	}
	return service.repository.Update(ctx, item, revision)
}

func (service *Service) Delete(ctx context.Context, actor Actor, publicID string, revision int64) error {
	if !actor.CanManage {
		return ErrForbidden
	}
	item, err := service.repository.Get(ctx, publicID)
	if err != nil {
		return err
	}
	if revision < 1 || item.Revision != revision || item.Status == StatusDeleted {
		return ErrConflict
	}
	if item.Provider == service.provider.Name() {
		if err := service.provider.Delete(ctx, item.ProviderVideoID); err != nil {
			return err
		}
	}
	item.Status, item.Published, item.PublishedAt, item.UpdatedAt = StatusDeleted, false, nil, service.now().UTC()
	_, err = service.repository.Update(ctx, item, revision)
	return err
}

func (service *Service) ApplyWebhook(ctx context.Context, raw []byte, headers map[string]string, webhookSecret string) error {
	if !verifyWebhook(raw, headers, webhookSecret) {
		return ErrInvalidSignature
	}
	var payload struct {
		VideoLibraryID int64  `json:"VideoLibraryId"`
		VideoGUID      string `json:"VideoGuid"`
		Status         int    `json:"Status"`
	}
	if err := jsonUnmarshal(raw, &payload); err != nil || payload.VideoGUID == "" || fmt.Sprint(payload.VideoLibraryID) != service.config.LibraryID {
		return ErrInvalid
	}
	if payload.Status < 0 || payload.Status > 10 {
		return ErrInvalid
	}
	digest := sha256.Sum256(raw)
	first, err := service.repository.RecordWebhook(ctx, payload.VideoGUID+":"+fmt.Sprint(payload.Status)+":"+hex.EncodeToString(digest[:]), service.provider.Name(), raw)
	if err != nil || !first {
		return err
	}
	// Caption and AI metadata notifications do not describe a playback-state
	// transition. Recording them preserves replay protection without regressing
	// a READY stream to UPLOADING.
	if payload.Status == 9 || payload.Status == 10 {
		return nil
	}
	item, err := service.repository.GetByProviderID(ctx, service.provider.Name(), payload.VideoGUID)
	if err != nil {
		return err
	}
	_, err = service.applyProviderState(ctx, item, bunnyStatus(payload.Status), item.DurationSeconds, item.ThumbnailURL, item.Width, item.Height)
	return err
}

func (service *Service) applyProviderState(ctx context.Context, item Item, status Status, duration int, thumbnail string, width, height int) (Item, error) {
	if item.Status == StatusDeleted || item.Status == StatusArchived {
		return item, nil
	}
	item.Status, item.DurationSeconds, item.UpdatedAt = status, duration, service.now().UTC()
	if thumbnail != "" {
		item.ThumbnailURL = thumbnail
	}
	// Zero means the provider has not measured the frame yet, which is the
	// normal state while a video is still encoding. Keeping the last known
	// size stops a later callback erasing one we already recorded.
	if width > 0 && height > 0 {
		item.Width, item.Height = width, height
	}
	if status == StatusFailed {
		item.Published, item.PublishedAt, item.FailureReason = false, nil, "provider processing failed"
	} else {
		item.FailureReason = ""
	}
	return service.repository.Update(ctx, item, item.Revision)
}

func verifyWebhook(raw []byte, headers map[string]string, secret string) bool {
	if secret == "" || headers["version"] != "v1" || headers["algorithm"] != "hmac-sha256" {
		return false
	}
	signature, err := hex.DecodeString(headers["signature"])
	if err != nil || len(signature) != sha256.Size {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(raw)
	return hmac.Equal(signature, mac.Sum(nil))
}

func normalizeTags(values []string) []string {
	result, seen := make([]string, 0, len(values)), map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && len(value) <= 60 && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}

func validVisibility(value Visibility) bool {
	return value == VisibilityPublic || value == VisibilityPrivate || value == VisibilityUnlisted
}

func newPublicID() string {
	bytes := make([]byte, 16)
	_, _ = rand.Read(bytes)
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:16])
}

var jsonUnmarshal = json.Unmarshal
