package checkin

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrInvalid   = errors.New("invalid check-in request")
	ErrForbidden = errors.New("check-in forbidden")
	ErrNotFound  = errors.New("check-in target not found")
	ErrConflict  = errors.New("check-in conflict")
	uuidPattern  = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
)

type Result string

const (
	ResultAdmitted         Result = "admitted"
	ResultAlreadyCheckedIn Result = "already_checked_in"
	ResultInvalid          Result = "invalid"
	ResultWrongEvent       Result = "wrong_event"
	ResultNotValid         Result = "not_valid"
)

type Actor struct {
	UserID     string
	InternalID string
	Role       string
}

type ScanInput struct {
	EventID     string
	Token       string
	DeviceLabel string
}

type ScanResult struct {
	Result         Result     `json:"result"`
	TicketRef      string     `json:"ticket_ref,omitempty"`
	CheckedInAt    *time.Time `json:"checked_in_at,omitempty"`
	CheckedInCount int64      `json:"checked_in_count"`
	Message        string     `json:"message,omitempty"`
}

type Count struct {
	EventID        string `json:"event_id"`
	CheckedInCount int64  `json:"checked_in_count"`
}

func (input ScanInput) normalized() (ScanInput, error) {
	input.EventID = strings.TrimSpace(input.EventID)
	input.Token = strings.TrimSpace(input.Token)
	input.DeviceLabel = strings.Join(strings.Fields(input.DeviceLabel), " ")
	if !uuidPattern.MatchString(input.EventID) {
		return ScanInput{}, ErrInvalid
	}
	if utf8.RuneCountInString(input.Token) < 16 || utf8.RuneCountInString(input.Token) > 512 {
		return ScanInput{}, ErrInvalid
	}
	if utf8.RuneCountInString(input.DeviceLabel) > 80 {
		return ScanInput{}, ErrInvalid
	}
	return input, nil
}

func shortRef(publicID string) string {
	publicID = strings.TrimSpace(publicID)
	if len(publicID) < 8 {
		return ""
	}
	return "…" + publicID[len(publicID)-4:]
}
