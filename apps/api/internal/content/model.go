package content

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

type Kind string
type Status string

const (
	Page        Kind = "page"
	Portfolio   Kind = "portfolio"
	Video       Kind = "video"
	Press       Kind = "press"
	Testimonial Kind = "testimonial"

	Draft       Status = "draft"
	Scheduled   Status = "scheduled"
	Published   Status = "published"
	Unpublished Status = "unpublished"
)

var (
	ErrNotFound  = errors.New("content not found")
	ErrConflict  = errors.New("content conflict")
	ErrForbidden = errors.New("content mutation forbidden")
	ErrInvalid   = errors.New("invalid content")
	slugPattern  = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	uuidPattern  = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
)

type SEO struct {
	Title         string `json:"title" bson:"title"`
	Description   string `json:"description" bson:"description"`
	CanonicalURL  string `json:"canonical_url" bson:"canonical_url"`
	SocialAssetID string `json:"social_image_asset_id" bson:"social_image_asset_id"`
}

type Result struct {
	Label string `json:"label" bson:"label"`
	Value string `json:"value" bson:"value"`
}

// Item is the stable API projection for every editorial collection. Fields not
// applicable to a kind remain empty, which keeps clients explicit without
// weakening kind-specific validation.
type Item struct {
	ID              string     `json:"-" bson:"-"`
	PublicID        string     `json:"id" bson:"public_id"`
	Kind            Kind       `json:"kind" bson:"kind"`
	Slug            string     `json:"slug,omitempty" bson:"slug,omitempty"`
	Title           string     `json:"title" bson:"title"`
	Summary         string     `json:"summary,omitempty" bson:"summary,omitempty"`
	Body            string     `json:"body,omitempty" bson:"body,omitempty"`
	Category        string     `json:"category,omitempty" bson:"category,omitempty"`
	Tags            []string   `json:"tags" bson:"tags"`
	Featured        bool       `json:"featured" bson:"featured"`
	GalleryAssetIDs []string   `json:"gallery_asset_ids" bson:"gallery_asset_ids"`
	Results         []Result   `json:"results" bson:"results"`
	ExternalURL     string     `json:"external_url,omitempty" bson:"external_url,omitempty"`
	EmbedURL        string     `json:"embed_url,omitempty" bson:"embed_url,omitempty"`
	Outlet          string     `json:"outlet,omitempty" bson:"outlet,omitempty"`
	PersonName      string     `json:"person_name,omitempty" bson:"person_name,omitempty"`
	PersonTitle     string     `json:"person_title,omitempty" bson:"person_title,omitempty"`
	Organization    string     `json:"organization,omitempty" bson:"organization,omitempty"`
	SEO             SEO        `json:"seo" bson:"seo"`
	Status          Status     `json:"status" bson:"status"`
	Approved        bool       `json:"approved" bson:"approved"`
	Revision        int64      `json:"revision" bson:"revision"`
	PublishAt       *time.Time `json:"publish_at,omitempty" bson:"publish_at,omitempty"`
	UnpublishAt     *time.Time `json:"unpublish_at,omitempty" bson:"unpublish_at,omitempty"`
	PublishedAt     *time.Time `json:"published_at,omitempty" bson:"published_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at" bson:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" bson:"updated_at"`
}

type Input struct {
	Kind                                                                Kind
	Slug, Title, Summary, Body, Category, ExternalURL, EmbedURL, Outlet string
	PersonName, PersonTitle, Organization                               string
	Tags, GalleryAssetIDs                                               []string
	Results                                                             []Result
	Featured                                                            bool
	SEO                                                                 SEO
}

func (input *Input) Normalize() {
	input.Slug = Slugify(input.Slug)
	for _, value := range []*string{&input.Title, &input.Summary, &input.Body, &input.Category, &input.ExternalURL, &input.EmbedURL, &input.Outlet, &input.PersonName, &input.PersonTitle, &input.Organization, &input.SEO.Title, &input.SEO.Description, &input.SEO.CanonicalURL, &input.SEO.SocialAssetID} {
		*value = strings.TrimSpace(*value)
	}
	input.Tags = cleanUnique(input.Tags)
	input.GalleryAssetIDs = cleanUnique(input.GalleryAssetIDs)
	for index := range input.Results {
		input.Results[index].Label = strings.TrimSpace(input.Results[index].Label)
		input.Results[index].Value = strings.TrimSpace(input.Results[index].Value)
	}
}

func (input Input) Validate(create bool) error {
	if !validKind(input.Kind) || !within(input.Title, 160, true) || !within(input.Summary, 500, false) || !within(input.Body, 30000, false) || !within(input.Category, 80, false) || !within(input.ExternalURL, 2048, false) || !within(input.EmbedURL, 2048, false) || !within(input.Outlet, 120, false) || !within(input.PersonName, 120, false) || !within(input.PersonTitle, 120, false) || !within(input.Organization, 160, false) || len(input.Tags) > 20 || len(input.GalleryAssetIDs) > 30 || len(input.Results) > 20 {
		return ErrInvalid
	}
	if input.Kind == Page || input.Kind == Portfolio {
		if create && (!slugPattern.MatchString(input.Slug) || len(input.Slug) > 120) {
			return ErrInvalid
		}
	} else if input.Slug != "" {
		return ErrInvalid
	}
	if input.Kind == Portfolio && !within(input.Category, 80, true) || input.Kind == Video && (!within(input.ExternalURL, 2048, true) || !within(input.EmbedURL, 2048, true) || !httpsURL(input.ExternalURL) || !httpsURL(input.EmbedURL)) || input.Kind == Press && (!within(input.Outlet, 120, true) || !within(input.ExternalURL, 2048, true) || !httpsURL(input.ExternalURL)) || input.Kind == Testimonial && !within(input.PersonName, 120, true) {
		return ErrInvalid
	}
	for _, value := range input.Tags {
		if !within(value, 120, true) {
			return ErrInvalid
		}
	}
	for _, value := range input.GalleryAssetIDs {
		if !ValidID(value) {
			return ErrInvalid
		}
	}
	for _, result := range input.Results {
		if !within(result.Label, 80, true) || !within(result.Value, 160, true) {
			return ErrInvalid
		}
	}
	if !within(input.SEO.Title, 70, false) || !within(input.SEO.Description, 180, false) || !within(input.SEO.CanonicalURL, 2048, false) || (input.SEO.CanonicalURL != "" && !httpsURL(input.SEO.CanonicalURL)) || (input.SEO.SocialAssetID != "" && !ValidID(input.SEO.SocialAssetID)) {
		return ErrInvalid
	}
	return nil
}

func (item Item) PublicAt(now time.Time) bool {
	return item.Approved && (item.Status == Published || item.Status == Scheduled) && item.PublishAt != nil && !item.PublishAt.After(now) && (item.UnpublishAt == nil || item.UnpublishAt.After(now))
}

func validKind(kind Kind) bool {
	return kind == Page || kind == Portfolio || kind == Video || kind == Press || kind == Testimonial
}
func ValidID(value string) bool { return uuidPattern.MatchString(value) }
func Slugify(value string) string {
	var result strings.Builder
	dash := false
	for _, char := range strings.ToLower(strings.TrimSpace(value)) {
		if char >= 'a' && char <= 'z' || char >= '0' && char <= '9' {
			result.WriteRune(char)
			dash = false
		} else if result.Len() > 0 && !dash {
			result.WriteByte('-')
			dash = true
		}
	}
	return strings.TrimSuffix(result.String(), "-")
}
func cleanUnique(values []string) []string {
	result, seen := []string{}, map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		key := strings.ToLower(value)
		if value != "" && !seen[key] {
			seen[key] = true
			result = append(result, value)
		}
	}
	return result
}
func within(value string, max int, required bool) bool {
	return utf8.ValidString(value) && utf8.RuneCountInString(value) <= max && len(value) <= max && (!required || strings.TrimSpace(value) != "")
}
func httpsURL(value string) bool {
	parsed, err := url.ParseRequestURI(value)
	return err == nil && parsed.Scheme == "https" && parsed.Host != ""
}
