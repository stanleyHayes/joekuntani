package video

import (
	"context"
	"errors"
	"regexp"
	"strconv"
	"strings"
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
	// Reported by the provider once processing finishes. Zero until then, and
	// zero for anything the provider never measured.
	Width, Height int
	// An operator's deliberate override, as "W:H". Empty means the measured
	// shape is correct, which it almost always is — this exists for the clip
	// that was letterboxed before it ever arrived.
	AspectRatio string
	Status      Status
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
	Title       string     `json:"title"`
	Slug        string     `json:"slug"`
	Description string     `json:"description"`
	Category    string     `json:"category"`
	Filename    string     `json:"filename"`
	MIMEType    string     `json:"mime_type"`
	Tags        []string   `json:"tags"`
	Visibility  Visibility `json:"visibility"`
	Bytes       int64      `json:"bytes"`
	SortOrder   int        `json:"sort_order"`
	// Optional at upload: the frame is not measured until encoding finishes,
	// so this is only for an operator who already knows the clip was delivered
	// in the wrong shape.
	AspectRatio string `json:"aspect_ratio"`
}

type UpdateInput struct {
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Category    string     `json:"category"`
	Tags        []string   `json:"tags"`
	Visibility  Visibility `json:"visibility"`
	SortOrder   int        `json:"sort_order"`
	// "" restores the measured frame. Anything else must read "W:H".
	AspectRatio string `json:"aspect_ratio"`
	Revision    int64  `json:"revision"`
}

var aspectRatioPattern = regexp.MustCompile(`^[1-9][0-9]{0,4}:[1-9][0-9]{0,4}$`)

// validAspectRatio accepts an empty override — which means "use what the
// provider measured" — and otherwise insists on W:H with both sides positive.
// A malformed value would reach the page as a broken layout rather than an
// error, so it is refused at the edge.
func validAspectRatio(value string) bool {
	return value == "" || aspectRatioPattern.MatchString(value)
}

type Category struct {
	ID, PublicID, Slug, Title, Description, ImageAssetID string
	Active                                               bool
	SortOrder                                            int
	Revision                                             int64
	CreatedBy                                            string
	CreatedAt, UpdatedAt                                 time.Time
}

type CategoryInput struct {
	Title        string `json:"title"`
	Description  string `json:"description"`
	ImageAssetID string `json:"image_asset_id"`
	Active       *bool  `json:"active,omitempty"`
	SortOrder    int    `json:"sort_order"`
	Revision     int64  `json:"revision,omitempty"`
}

type ProviderVideo struct {
	ID, LibraryID, ThumbnailURL string
	DurationSeconds             int
	Width, Height               int
	Status                      Status
}

// ResolvedAspectRatio is the shape the player should reserve, as "W:H".
//
// The override wins when an operator set one. Otherwise the measured frame is
// reduced to its simplest terms, so a 1920×1080 upload reads "16:9" rather than
// "1920:1080". Before the provider reports a size — and for anything it never
// measured — this falls back to 16:9, which is what the page assumed for every
// video before any of this existed.
func (item Item) ResolvedAspectRatio() string {
	if ratio := strings.TrimSpace(item.AspectRatio); ratio != "" {
		return ratio
	}
	if item.Width > 0 && item.Height > 0 {
		divisor := gcd(item.Width, item.Height)
		return strconv.Itoa(item.Width/divisor) + ":" + strconv.Itoa(item.Height/divisor)
	}
	return "16:9"
}

func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	if a < 0 {
		return -a
	}
	return a
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
	CreateCategory(context.Context, Category) error
	ListCategories(context.Context) ([]Category, error)
	GetCategory(context.Context, string) (Category, error)
	UpdateCategory(context.Context, Category, int64) (Category, error)
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
