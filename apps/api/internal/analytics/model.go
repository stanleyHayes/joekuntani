package analytics

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

var (
	ErrForbidden   = errors.New("analytics access forbidden")
	ErrInvalid     = errors.New("invalid analytics input")
	ErrUnavailable = errors.New("analytics unavailable")
)

type Actor struct {
	UserID string
	Role   auth.Role
}

type EventName string

const (
	EventPageView                EventName = "page_view"
	EventCTAClicked              EventName = "cta_clicked"
	EventServiceViewed           EventName = "service_viewed"
	EventWorkViewed              EventName = "work_viewed"
	EventMediaKitDownloaded      EventName = "media_kit_downloaded"
	EventBookingStarted          EventName = "booking_started"
	EventBookingStepCompleted    EventName = "booking_step_completed"
	EventBookingSubmitted        EventName = "booking_submitted"
	EventBookingFailed           EventName = "booking_failed"
	EventAdminStageChanged       EventName = "admin_stage_changed"
	EventCampaignCompleted       EventName = "campaign_completed"
	EventEventViewed             EventName = "event_viewed"
	EventTicketSelectionStarted  EventName = "ticket_selection_started"
	EventTicketCheckoutStarted   EventName = "ticket_checkout_started"
	EventTicketPurchaseCompleted EventName = "ticket_purchase_completed"
	EventTicketPurchaseFailed    EventName = "ticket_purchase_failed"
	EventTicketCheckedIn         EventName = "ticket_checked_in"
)

var allowedProperties = map[EventName]map[string]bool{
	EventPageView:                {"path": true, "referrer": true, "utm_source": true, "utm_medium": true, "utm_campaign": true},
	EventCTAClicked:              {"cta_id": true, "page": true, "destination": true},
	EventServiceViewed:           {"service_slug": true},
	EventWorkViewed:              {"work_slug": true, "category": true},
	EventMediaKitDownloaded:      {"source_page": true, "version": true},
	EventBookingStarted:          {"service": true, "source": true},
	EventBookingStepCompleted:    {"step": true, "service": true},
	EventBookingSubmitted:        {"reference": true, "enquiry_type": true, "source": true},
	EventBookingFailed:           {"step": true, "error_code": true},
	EventAdminStageChanged:       {"from": true, "to": true, "enquiry_id": true},
	EventCampaignCompleted:       {"campaign_id": true, "result_summary": true},
	EventEventViewed:             {"event_slug": true, "source": true},
	EventTicketSelectionStarted:  {"event_id": true, "ticket_type_ids": true},
	EventTicketCheckoutStarted:   {"order_reference": true, "event_id": true, "quantity": true},
	EventTicketPurchaseCompleted: {"order_reference": true, "event_id": true, "amount": true, "currency": true, "quantity": true},
	EventTicketPurchaseFailed:    {"order_reference": true, "event_id": true, "error_code": true},
	EventTicketCheckedIn:         {"event_id": true, "ticket_type_id": true},
}

var internalOnly = map[EventName]bool{
	EventAdminStageChanged: true,
	EventCampaignCompleted: true,
	EventTicketCheckedIn:   true,
}

var blockedPropertyHints = []string{"name", "email", "phone", "note", "message", "body", "address", "buyer"}

type TrackInput struct {
	Name       EventName
	Properties map[string]string
	OccurredAt time.Time
}

type ConversionEvent struct {
	PublicID   string            `json:"id"`
	Name       EventName         `json:"name"`
	Properties map[string]string `json:"properties"`
	Internal   bool              `json:"internal"`
	OccurredAt time.Time         `json:"occurred_at"`
	CreatedAt  time.Time         `json:"created_at"`
}

type Overview struct {
	GeneratedAt       time.Time        `json:"generated_at"`
	ConversionTotal   int              `json:"conversion_total"`
	BookingSubmitted  int              `json:"booking_submitted"`
	TicketPurchases   int              `json:"ticket_purchases"`
	Pipeline          map[string]int   `json:"pipeline"`
	BookingsByStatus  map[string]int   `json:"bookings_by_status"`
	CampaignsByStatus map[string]int   `json:"campaigns_by_status"`
	ContentPublished  int              `json:"content_published"`
	TopSources        []NamedCount     `json:"top_sources"`
	TopPaths          []NamedCount     `json:"top_paths"`
	Audience          []AudienceMetric `json:"audience"`
}

type NamedCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type AudienceMetric struct {
	Platform    string `json:"platform"`
	MetricDate  string `json:"metric_date"`
	Followers   int64  `json:"followers"`
	Reach       int64  `json:"reach"`
	Impressions int64  `json:"impressions"`
}

func canRead(role auth.Role) bool {
	return role.Allows(auth.PermissionDashboardsRead)
}

func sanitize(input TrackInput) (TrackInput, error) {
	input.Name = EventName(strings.TrimSpace(string(input.Name)))
	allowed, ok := allowedProperties[input.Name]
	if !ok {
		return TrackInput{}, ErrInvalid
	}
	if input.OccurredAt.IsZero() {
		input.OccurredAt = time.Now().UTC()
	}
	clean := make(map[string]string, len(input.Properties))
	for key, value := range input.Properties {
		key = strings.TrimSpace(strings.ToLower(key))
		if !allowed[key] {
			return TrackInput{}, ErrInvalid
		}
		for _, hint := range blockedPropertyHints {
			if strings.Contains(key, hint) {
				return TrackInput{}, ErrInvalid
			}
		}
		value = strings.TrimSpace(value)
		if value == "" || !utf8.ValidString(value) || utf8.RuneCountInString(value) > 200 {
			return TrackInput{}, ErrInvalid
		}
		lower := strings.ToLower(value)
		if strings.Contains(lower, "@") || strings.Contains(lower, "mailto:") {
			return TrackInput{}, ErrInvalid
		}
		clean[key] = value
	}
	input.Properties = clean
	return input, nil
}
