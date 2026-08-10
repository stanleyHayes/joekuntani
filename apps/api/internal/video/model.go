package video

import (
	"context"
	"errors"
	"time"
)

var (
	ErrInvalid             = errors.New("invalid video")
	ErrForbidden           = errors.New("video access forbidden")
	ErrNotFound            = errors.New("video not found")
	ErrConflict            = errors.New("video state conflict")
	ErrProviderUnavailable = errors.New("video provider unavailable")
	ErrInvalidSignature    = errors.New("invalid video webhook signature")
)

type Status string

const (
	StatusUploading  Status = "uploading"
	StatusProcessing Status = "processing"
	StatusReady      Status = "ready"
	StatusFailed     Status = "failed"
	StatusArchived   Status = "archived"
	StatusDeleted    Status = "deleted"
)

type Visibility string

const (
	VisibilityPublic   Visibility = "public"
	VisibilityPrivate  Visibility = "private"
	VisibilityUnlisted Visibility = "unlisted"
)

type Item struct {
	ID, PublicID, Slug, Title, Description, Category string
	Tags                                             []string
	Provider                                         string
	ProviderVideoID, ProviderLibraryID               string
	ThumbnailURL                                     string
	DurationSeconds                                  int
	Status                                           Status
	Visibility                                       Visibility
	Published                                        bool
	PublishedAt                                      *time.Time
	SortOrder                                        int
	Filename, MIMEType                               string
	Bytes                                            int64
	FailureReason                                    string
	Revision                                         int64
	CreatedBy                                        string
	CreatedAt, UpdatedAt                             time.Time
}

type Actor struct {
	ID        string
	CanManage bool
}

type CreateInput struct {
	Title, Slug, Description, Category, Filename, MIMEType string
	Tags                                                   []string
	Visibility                                             Visibility
	Bytes                                                  int64
	SortOrder                                              int
}

type UpdateInput struct {
	Title, Description, Category string
	Tags                         []string
	Visibility                   Visibility
	SortOrder                    int
	Revision                     int64
}

type ProviderVideo struct {
	ID, LibraryID, ThumbnailURL string
	DurationSeconds             int
	Status                      Status
}

type UploadAuthorization struct {
	Endpoint       string `json:"endpoint"`
	Signature      string `json:"signature"`
	ExpirationTime int64  `json:"expiration_time"`
	LibraryID      string `json:"library_id"`
	VideoID        string `json:"video_id"`
	Filename       string `json:"filename"`
	MIMEType       string `json:"mime_type"`
}

type PlaybackInfo struct {
	EmbedURL     string `json:"embed_url"`
	HLSURL       string `json:"hls_url"`
	ThumbnailURL string `json:"thumbnail_url"`
}

type Provider interface {
	Name() string
	Create(context.Context, string) (ProviderVideo, error)
	Get(context.Context, string) (ProviderVideo, error)
	Delete(context.Context, string) error
	UploadAuthorization(string, string, string, time.Time) (UploadAuthorization, error)
	Playback(string) PlaybackInfo
}

type Repository interface {
	Create(context.Context, Item) error
	Get(context.Context, string) (Item, error)
	GetByProviderID(context.Context, string, string) (Item, error)
	List(context.Context, bool) ([]Item, error)
	Update(context.Context, Item, int64) (Item, error)
	RecordWebhook(context.Context, string, string, []byte) (bool, error)
}

type UnavailableProvider struct{}

func (UnavailableProvider) Name() string { return "unavailable" }
func (UnavailableProvider) Create(context.Context, string) (ProviderVideo, error) {
	return ProviderVideo{}, ErrProviderUnavailable
}
func (UnavailableProvider) Get(context.Context, string) (ProviderVideo, error) {
	return ProviderVideo{}, ErrProviderUnavailable
}
func (UnavailableProvider) Delete(context.Context, string) error { return ErrProviderUnavailable }
func (UnavailableProvider) UploadAuthorization(string, string, string, time.Time) (UploadAuthorization, error) {
	return UploadAuthorization{}, ErrProviderUnavailable
}
func (UnavailableProvider) Playback(string) PlaybackInfo { return PlaybackInfo{} }
