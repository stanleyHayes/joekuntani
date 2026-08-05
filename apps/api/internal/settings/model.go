package settings

import (
	"errors"
	"net/mail"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const GlobalKey = "global"

type Link struct {
	Label string `json:"label" bson:"label"`
	Href  string `json:"href" bson:"href"`
}
type CTA struct {
	Key         string `json:"key" bson:"key"`
	Title       string `json:"title" bson:"title"`
	Description string `json:"description" bson:"description"`
	Label       string `json:"label" bson:"label"`
	Href        string `json:"href" bson:"href"`
}
type SocialLink struct {
	Platform string `json:"platform" bson:"platform"`
	URL      string `json:"url" bson:"url"`
}
type Contact struct {
	PublicEmail string `json:"public_email" bson:"public_email"`
	Phone       string `json:"phone" bson:"phone"`
	Location    string `json:"location" bson:"location"`
}
type Brand struct {
	Name           string `json:"name" bson:"name"`
	Tagline        string `json:"tagline" bson:"tagline"`
	LogoAssetID    string `json:"logo_asset_id" bson:"logo_asset_id"`
	FaviconAssetID string `json:"favicon_asset_id" bson:"favicon_asset_id"`
}
type SEO struct {
	TitleTemplate string `json:"title_template" bson:"title_template"`
	DefaultTitle  string `json:"default_title" bson:"default_title"`
	Description   string `json:"description" bson:"description"`
	CanonicalBase string `json:"canonical_base" bson:"canonical_base"`
	SocialImageID string `json:"social_image_asset_id" bson:"social_image_asset_id"`
}
type Consent struct {
	Version        string `json:"version" bson:"version"`
	PrivacyLabel   string `json:"privacy_label" bson:"privacy_label"`
	MarketingLabel string `json:"marketing_label" bson:"marketing_label"`
	PrivacyURL     string `json:"privacy_url" bson:"privacy_url"`
}
type Integration struct {
	EmailProvider     string `json:"email_provider" bson:"email_provider"`
	MediaProvider     string `json:"media_provider" bson:"media_provider"`
	AnalyticsProvider string `json:"analytics_provider" bson:"analytics_provider"`
	PaymentProvider   string `json:"payment_provider" bson:"payment_provider"`
}
type Team struct {
	NotificationRecipients []string `json:"notification_recipients" bson:"notification_recipients"`
	BusinessTimezone       string   `json:"business_timezone" bson:"business_timezone"`
}
type Values struct {
	Navigation   []Link       `json:"navigation" bson:"navigation"`
	Footer       []Link       `json:"footer" bson:"footer"`
	CTAs         []CTA        `json:"ctas" bson:"ctas"`
	Contact      Contact      `json:"contact" bson:"contact"`
	Social       []SocialLink `json:"social" bson:"social"`
	Brand        Brand        `json:"brand" bson:"brand"`
	SEO          SEO          `json:"seo" bson:"seo"`
	Consent      Consent      `json:"consent" bson:"consent"`
	Integrations Integration  `json:"integrations" bson:"integrations"`
	Team         Team         `json:"team" bson:"team"`
}
type Document struct {
	Key             string     `json:"key" bson:"key"`
	Version         int64      `json:"version" bson:"version"`
	Draft           Values     `json:"draft" bson:"draft"`
	Published       *Values    `json:"published,omitempty" bson:"published"`
	ContentComplete bool       `json:"content_complete" bson:"content_complete"`
	UpdatedBy       string     `json:"updated_by" bson:"updated_by"`
	UpdatedAt       time.Time  `json:"updated_at" bson:"updated_at"`
	PublishedAt     *time.Time `json:"published_at,omitempty" bson:"published_at"`
}
type PublicValues struct {
	Navigation []Link       `json:"navigation"`
	Footer     []Link       `json:"footer"`
	CTAs       []CTA        `json:"ctas"`
	Contact    Contact      `json:"contact"`
	Social     []SocialLink `json:"social"`
	Brand      Brand        `json:"brand"`
	SEO        SEO          `json:"seo"`
	Consent    Consent      `json:"consent"`
}
type SecretStatus struct {
	EmailConfigured     bool `json:"email_configured"`
	MediaConfigured     bool `json:"media_configured"`
	AnalyticsConfigured bool `json:"analytics_configured"`
	PaymentConfigured   bool `json:"payment_configured"`
}

func EmptyValues() Values {
	return Values{Navigation: []Link{}, Footer: []Link{}, CTAs: []CTA{}, Social: []SocialLink{}, Team: Team{NotificationRecipients: []string{}}}
}

var keyPattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{1,47}$`)
var publicIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)

func Validate(values Values) error {
	if values.Navigation == nil || values.Footer == nil || values.CTAs == nil || values.Social == nil || values.Team.NotificationRecipients == nil {
		return errors.New("required settings lists must not be null")
	}
	if len(values.Navigation) > 12 || len(values.Footer) > 12 || len(values.CTAs) > 20 || len(values.Social) > 12 || len(values.Team.NotificationRecipients) > 20 {
		return errors.New("settings list limit exceeded")
	}
	if !nonblankWithin(values.Brand.Name, 100) || !within(values.Brand.Tagline, 200) || !within(values.SEO.DefaultTitle, 70) || !within(values.SEO.Description, 180) {
		return errors.New("brand and SEO values are invalid")
	}
	if !assetID(values.Brand.LogoAssetID) || !assetID(values.Brand.FaviconAssetID) || !assetID(values.SEO.SocialImageID) || !within(values.SEO.TitleTemplate, 100) || !within(values.Contact.Phone, 40) || !within(values.Contact.Location, 120) {
		return errors.New("settings value length exceeded")
	}
	if values.Contact.PublicEmail != "" {
		address, err := mail.ParseAddress(values.Contact.PublicEmail)
		if err != nil || address.Address != values.Contact.PublicEmail || !within(values.Contact.PublicEmail, 254) {
			return errors.New("public email is invalid")
		}
	}
	for _, link := range append(append([]Link{}, values.Navigation...), values.Footer...) {
		if !nonblankWithin(link.Label, 80) || !within(link.Href, 2048) || !safeHref(link.Href) {
			return errors.New("navigation or footer link is invalid")
		}
	}
	for _, item := range values.CTAs {
		if !keyPattern.MatchString(item.Key) || !nonblankWithin(item.Label, 80) || !within(item.Title, 120) || !within(item.Description, 300) || !within(item.Href, 2048) || !safeHref(item.Href) {
			return errors.New("CTA is invalid")
		}
	}
	for _, item := range values.Social {
		parsed, err := url.ParseRequestURI(item.URL)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || !nonblankWithin(item.Platform, 50) || !within(item.URL, 2048) {
			return errors.New("social link must use an absolute HTTPS URL")
		}
	}
	if !within(values.SEO.CanonicalBase, 2048) {
		return errors.New("canonical base is too long")
	}
	if values.SEO.CanonicalBase != "" {
		parsed, err := url.ParseRequestURI(values.SEO.CanonicalBase)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
			return errors.New("canonical base must use HTTPS")
		}
	}
	if !nonblankWithin(values.Consent.Version, 80) || !nonblankWithin(values.Consent.PrivacyLabel, 500) || !within(values.Consent.MarketingLabel, 500) || !within(values.Consent.PrivacyURL, 2048) || !safeHref(values.Consent.PrivacyURL) {
		return errors.New("consent text and version are required")
	}
	if !nonblankWithin(values.Team.BusinessTimezone, 100) {
		return errors.New("business timezone is required")
	}
	if _, err := time.LoadLocation(values.Team.BusinessTimezone); err != nil {
		return errors.New("business timezone is invalid")
	}
	for _, email := range values.Team.NotificationRecipients {
		address, err := mail.ParseAddress(email)
		if err != nil || address.Address != email || !within(email, 254) {
			return errors.New("notification recipient is invalid")
		}
	}
	for _, provider := range []string{values.Integrations.EmailProvider, values.Integrations.MediaProvider, values.Integrations.AnalyticsProvider, values.Integrations.PaymentProvider} {
		if !within(provider, 50) || (provider != "" && !keyPattern.MatchString(provider)) {
			return errors.New("integration provider is invalid")
		}
	}
	return nil
}

func within(value string, maximum int) bool {
	return utf8.ValidString(value) && utf8.RuneCountInString(value) <= maximum
}
func nonblankWithin(value string, maximum int) bool {
	return strings.TrimSpace(value) != "" && within(value, maximum)
}
func assetID(value string) bool { return value == "" || publicIDPattern.MatchString(value) }

func safeHref(value string) bool {
	if strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") {
		return true
	}
	parsed, err := url.ParseRequestURI(value)
	return err == nil && parsed.Scheme == "https" && parsed.Host != ""
}

func (values Values) Public() PublicValues {
	return PublicValues{Navigation: values.Navigation, Footer: values.Footer, CTAs: values.CTAs, Contact: values.Contact, Social: values.Social, Brand: values.Brand, SEO: values.SEO, Consent: values.Consent}
}

var ErrNotFound = errors.New("settings not found")
var ErrConflict = errors.New("settings version conflict")
var ErrForbidden = errors.New("settings change forbidden")
