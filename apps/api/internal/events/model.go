package events

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type EventStatus string

const (
	EventDraft     EventStatus = "draft"
	EventPublished EventStatus = "published"
	EventCancelled EventStatus = "cancelled"
)

type TicketStatus string

const (
	TicketDraft     TicketStatus = "draft"
	TicketScheduled TicketStatus = "scheduled"
	TicketOnSale    TicketStatus = "on_sale"
	TicketPaused    TicketStatus = "paused"
	TicketSoldOut   TicketStatus = "sold_out"
	TicketSaleEnded TicketStatus = "sale_ended"
)

type Venue struct {
	Name          string `json:"name" bson:"name"`
	Address       string `json:"address" bson:"address"`
	City          string `json:"city" bson:"city"`
	CountryCode   string `json:"country_code" bson:"country_code"`
	MapURL        string `json:"map_url,omitempty" bson:"map_url,omitempty"`
	Accessibility string `json:"accessibility,omitempty" bson:"accessibility,omitempty"`
}

type Policies struct {
	Refunds       string `json:"refunds" bson:"refunds"`
	Entry         string `json:"entry" bson:"entry"`
	AgeLimit      int    `json:"age_limit" bson:"age_limit"`
	AgeGuidance   string `json:"age_guidance,omitempty" bson:"age_guidance,omitempty"`
	Accessibility string `json:"accessibility,omitempty" bson:"accessibility,omitempty"`
}

type BannerSchedule struct {
	Featured bool       `json:"featured" bson:"featured"`
	StartsAt *time.Time `json:"starts_at,omitempty" bson:"starts_at,omitempty"`
	EndsAt   *time.Time `json:"ends_at,omitempty" bson:"ends_at,omitempty"`
}

type Event struct {
	ID            string         `json:"-" bson:"-"`
	PublicID      string         `json:"id" bson:"public_id"`
	Slug          string         `json:"slug" bson:"slug"`
	Title         string         `json:"title" bson:"title"`
	Summary       string         `json:"summary" bson:"summary"`
	Description   string         `json:"description" bson:"description"`
	Venue         Venue          `json:"venue" bson:"venue"`
	Policies      Policies       `json:"policies" bson:"policies"`
	StartsAt      time.Time      `json:"starts_at" bson:"starts_at"`
	EndsAt        time.Time      `json:"ends_at" bson:"ends_at"`
	Timezone      string         `json:"timezone" bson:"timezone"`
	Capacity      int            `json:"capacity" bson:"capacity"`
	BannerAssetID string         `json:"banner_asset_id,omitempty" bson:"banner_asset_id,omitempty"`
	Banner        BannerSchedule `json:"banner" bson:"banner"`
	Status        EventStatus    `json:"status" bson:"status"`
	PublishedAt   *time.Time     `json:"published_at,omitempty" bson:"published_at,omitempty"`
	CancelledAt   *time.Time     `json:"cancelled_at,omitempty" bson:"cancelled_at,omitempty"`
	CreatedAt     time.Time      `json:"created_at" bson:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at" bson:"updated_at"`
}

type TicketType struct {
	ID          string       `json:"-" bson:"-"`
	PublicID    string       `json:"id" bson:"public_id"`
	EventID     string       `json:"event_id" bson:"event_id"`
	Name        string       `json:"name" bson:"name"`
	Description string       `json:"description" bson:"description"`
	Price       string       `json:"price" bson:"-"`
	Currency    string       `json:"currency" bson:"currency"`
	Capacity    int          `json:"capacity" bson:"capacity"`
	Sold        int          `json:"sold" bson:"sold"`
	Reserved    int          `json:"reserved" bson:"reserved"`
	MinPerOrder int          `json:"min_per_order" bson:"min_per_order"`
	MaxPerOrder int          `json:"max_per_order" bson:"max_per_order"`
	SalesStart  time.Time    `json:"sales_start" bson:"sales_start"`
	SalesEnd    time.Time    `json:"sales_end" bson:"sales_end"`
	Paused      bool         `json:"paused" bson:"paused"`
	Status      TicketStatus `json:"status" bson:"status"`
	SortOrder   int          `json:"sort_order" bson:"sort_order"`
	CreatedAt   time.Time    `json:"created_at" bson:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at" bson:"updated_at"`
}

type EventInput struct {
	Title         string         `json:"title"`
	Summary       string         `json:"summary"`
	Description   string         `json:"description"`
	Timezone      string         `json:"timezone"`
	BannerAssetID string         `json:"banner_asset_id"`
	Venue         Venue          `json:"venue"`
	Policies      Policies       `json:"policies"`
	StartsAt      time.Time      `json:"starts_at"`
	EndsAt        time.Time      `json:"ends_at"`
	Capacity      int            `json:"capacity"`
	Banner        BannerSchedule `json:"banner"`
}

type TicketInput struct {
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       string    `json:"price"`
	Currency    string    `json:"currency"`
	Capacity    int       `json:"capacity"`
	MinPerOrder int       `json:"min_per_order"`
	MaxPerOrder int       `json:"max_per_order"`
	SalesStart  time.Time `json:"sales_start"`
	SalesEnd    time.Time `json:"sales_end"`
	SortOrder   int       `json:"sort_order"`
}

var (
	ErrForbidden        = errors.New("event mutation forbidden")
	ErrInvalid          = errors.New("invalid event")
	ErrNotFound         = errors.New("event not found")
	ErrConflict         = errors.New("event conflict")
	uuidPattern         = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	slugPattern         = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	pricePattern        = regexp.MustCompile(`^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$`)
	supportedCurrencies = map[string]struct{}{"GHS": {}, "USD": {}, "EUR": {}, "GBP": {}}
)

func (input *EventInput) Normalize() {
	input.Title = strings.TrimSpace(input.Title)
	input.Summary = strings.TrimSpace(input.Summary)
	input.Description = strings.TrimSpace(input.Description)
	input.Timezone = strings.TrimSpace(input.Timezone)
	input.BannerAssetID = strings.TrimSpace(input.BannerAssetID)
	input.Venue.Name = strings.TrimSpace(input.Venue.Name)
	input.Venue.Address = strings.TrimSpace(input.Venue.Address)
	input.Venue.City = strings.TrimSpace(input.Venue.City)
	input.Venue.CountryCode = strings.ToUpper(strings.TrimSpace(input.Venue.CountryCode))
	input.Venue.MapURL = strings.TrimSpace(input.Venue.MapURL)
	input.Venue.Accessibility = strings.TrimSpace(input.Venue.Accessibility)
	input.Policies.Refunds = strings.TrimSpace(input.Policies.Refunds)
	input.Policies.Entry = strings.TrimSpace(input.Policies.Entry)
	input.Policies.AgeGuidance = strings.TrimSpace(input.Policies.AgeGuidance)
	input.Policies.Accessibility = strings.TrimSpace(input.Policies.Accessibility)
}

func (input EventInput) Validate() error {
	if !bounded(input.Title, 2, 160) || !bounded(input.Summary, 0, 320) || !bounded(input.Description, 0, 20000) || !bounded(input.Timezone, 1, 120) || input.Capacity < 1 || input.Capacity > 1_000_000 {
		return ErrInvalid
	}
	if input.StartsAt.IsZero() || !input.EndsAt.After(input.StartsAt) || input.Timezone == "" {
		return ErrInvalid
	}
	if _, err := time.LoadLocation(input.Timezone); err != nil {
		return ErrInvalid
	}
	if !bounded(input.Venue.Name, 2, 200) || !bounded(input.Venue.Address, 1, 500) || !bounded(input.Venue.City, 1, 120) || !validCountryCode(input.Venue.CountryCode) || !bounded(input.Venue.MapURL, 0, 2048) || !bounded(input.Venue.Accessibility, 0, 2000) || !validHTTPSURL(input.Venue.MapURL) {
		return ErrInvalid
	}
	if !bounded(input.Policies.Refunds, 1, 5000) || !bounded(input.Policies.Entry, 1, 5000) || !bounded(input.Policies.AgeGuidance, 0, 1000) || !bounded(input.Policies.Accessibility, 0, 2000) || input.Policies.AgeLimit < 0 || input.Policies.AgeLimit > 100 {
		return ErrInvalid
	}
	if input.Banner.Featured {
		if !ValidPublicID(input.BannerAssetID) || input.Banner.StartsAt == nil || input.Banner.EndsAt == nil || !input.Banner.EndsAt.After(*input.Banner.StartsAt) || input.Banner.StartsAt.Before(input.StartsAt.Add(-180*24*time.Hour)) || input.Banner.EndsAt.After(input.EndsAt) {
			return ErrInvalid
		}
	} else if input.BannerAssetID != "" || input.Banner.StartsAt != nil || input.Banner.EndsAt != nil {
		return ErrInvalid
	}
	return nil
}

func (input *TicketInput) Normalize() {
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	input.Price = strings.TrimSpace(input.Price)
	input.Currency = strings.ToUpper(strings.TrimSpace(input.Currency))
}

func (input TicketInput) Validate(event Event) error {
	if !bounded(input.Name, 2, 120) || !bounded(input.Description, 0, 2000) || !pricePattern.MatchString(input.Price) || !supportedCurrency(input.Currency) {
		return ErrInvalid
	}
	if _, err := bson.ParseDecimal128(input.Price); err != nil {
		return ErrInvalid
	}
	if input.Capacity < 1 || input.Capacity > event.Capacity || input.MinPerOrder < 1 || input.MaxPerOrder < input.MinPerOrder || input.MaxPerOrder > input.Capacity || input.SortOrder < 0 || input.SortOrder > 10000 {
		return ErrInvalid
	}
	if input.SalesStart.IsZero() || !input.SalesEnd.After(input.SalesStart) || input.SalesEnd.After(event.EndsAt) {
		return ErrInvalid
	}
	return nil
}

func TicketState(ticket TicketType, now time.Time) TicketStatus {
	if ticket.Paused {
		return TicketPaused
	}
	if ticket.Sold+ticket.Reserved >= ticket.Capacity {
		return TicketSoldOut
	}
	if now.Before(ticket.SalesStart) {
		return TicketScheduled
	}
	if !now.Before(ticket.SalesEnd) {
		return TicketSaleEnded
	}
	return TicketOnSale
}

func ValidPublicID(value string) bool { return uuidPattern.MatchString(value) }
func ValidSlug(value string) bool     { return len(value) <= 160 && slugPattern.MatchString(value) }

func validHTTPSURL(value string) bool {
	if value == "" {
		return true
	}
	parsed, err := url.Parse(value)
	return err == nil && parsed.Scheme == "https" && parsed.Host != "" && parsed.User == nil
}

func bounded(value string, minimum, maximum int) bool {
	characters := utf8.RuneCountInString(value)
	return utf8.ValidString(value) && characters >= minimum && characters <= maximum && len(value) <= maximum
}

func validCountryCode(value string) bool {
	return len(value) == 2 && value[0] >= 'A' && value[0] <= 'Z' && value[1] >= 'A' && value[1] <= 'Z'
}

func supportedCurrency(value string) bool {
	_, ok := supportedCurrencies[value]
	return ok
}
