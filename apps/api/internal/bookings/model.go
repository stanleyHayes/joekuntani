package bookings

import (
	"errors"
	"regexp"
	"strings"
	"time"
)

type Status string

const (
	Tentative Status = "tentative"
	Confirmed Status = "confirmed"
	Cancelled Status = "cancelled"
)

var (
	ErrInvalid   = errors.New("invalid booking")
	ErrForbidden = errors.New("booking access forbidden")
	ErrNotFound  = errors.New("booking not found")
	ErrConflict  = errors.New("booking conflict")
	uuidPattern  = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
)

type Permission string

const (
	Read  Permission = "bookings.read"
	Write Permission = "bookings.write"
)

type Actor struct {
	InternalID  string
	Permissions map[Permission]bool
}

type Booking struct {
	ID           string            `json:"id"`
	EnquiryID    string            `json:"enquiry_id"`
	Title        string            `json:"title"`
	ServiceID    string            `json:"service_id"`
	Venue        string            `json:"venue"`
	City         string            `json:"city"`
	Country      string            `json:"country"`
	StartAt      time.Time         `json:"start_at"`
	EndAt        time.Time         `json:"end_at"`
	Status       Status            `json:"status"`
	Fee          string            `json:"fee"`
	Currency     string            `json:"currency"`
	Requirements map[string]string `json:"requirements"`
	Version      int64             `json:"version"`
	DeletedAt    *time.Time        `json:"deleted_at,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
}

type Input struct {
	EnquiryID    string            `json:"enquiry_id"`
	Title        string            `json:"title"`
	ServiceID    string            `json:"service_id"`
	Venue        string            `json:"venue"`
	City         string            `json:"city"`
	Country      string            `json:"country"`
	StartAt      time.Time         `json:"start_at"`
	EndAt        time.Time         `json:"end_at"`
	Status       Status            `json:"status"`
	Fee          string            `json:"fee"`
	Currency     string            `json:"currency"`
	Requirements map[string]string `json:"requirements"`
	Version      int64             `json:"version"`
}

type Warning struct {
	BookingID string    `json:"booking_id"`
	Title     string    `json:"title"`
	Status    Status    `json:"status"`
	StartAt   time.Time `json:"start_at"`
	EndAt     time.Time `json:"end_at"`
}

type Result struct {
	Booking  Booking   `json:"booking"`
	Warnings []Warning `json:"warnings"`
}

type Calendar struct {
	Items    []Booking `json:"items"`
	Timezone string    `json:"timezone"`
}

type Filter struct {
	From, To time.Time
	Status   Status
}

func (i Input) validate(create bool) error {
	if (create && i.Version != 0) || !uuidPattern.MatchString(i.EnquiryID) || !uuidPattern.MatchString(i.ServiceID) || len(strings.TrimSpace(i.Title)) < 2 || len(i.Title) > 160 || !i.StartAt.Before(i.EndAt) || i.EndAt.Sub(i.StartAt) > 31*24*time.Hour || len(i.Venue) > 200 || len(i.City) > 100 || !regexp.MustCompile(`^[A-Z]{2}$`).MatchString(i.Country) || !regexp.MustCompile(`^(0|[1-9][0-9]{0,14})\.[0-9]{2}$`).MatchString(i.Fee) || (i.Currency != "GHS" && i.Currency != "USD" && i.Currency != "EUR" && i.Currency != "GBP") || len(i.Requirements) > 30 {
		return ErrInvalid
	}
	if i.Status != Tentative && i.Status != Confirmed && i.Status != Cancelled {
		return ErrInvalid
	}
	for key, value := range i.Requirements {
		if !regexp.MustCompile(`^[a-z][a-z0-9_-]{0,47}$`).MatchString(key) || len(value) > 500 {
			return ErrInvalid
		}
	}
	return nil
}

func transition(from, to Status) bool {
	return from == to || (from == Tentative && (to == Confirmed || to == Cancelled)) || (from == Confirmed && to == Cancelled)
}
