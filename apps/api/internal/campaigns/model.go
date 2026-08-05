package campaigns

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"
)

var (
	ErrInvalid   = errors.New("invalid campaign")
	ErrNotFound  = errors.New("campaign not found")
	ErrForbidden = errors.New("campaign access forbidden")
	ErrConflict  = errors.New("campaign conflict")
)

type Status string
type DeliverableStatus string
type ApprovalStatus string

const (
	StatusDraft     Status = "draft"
	StatusActive    Status = "active"
	StatusPaused    Status = "paused"
	StatusCompleted Status = "completed"
	StatusCancelled Status = "cancelled"

	DeliverablePending    DeliverableStatus = "pending"
	DeliverableInProgress DeliverableStatus = "in_progress"
	DeliverableSubmitted  DeliverableStatus = "submitted"
	DeliverableApproved   DeliverableStatus = "approved"
	DeliverablePublished  DeliverableStatus = "published"

	ApprovalPending  ApprovalStatus = "pending"
	ApprovalApproved ApprovalStatus = "approved"
	ApprovalRejected ApprovalStatus = "rejected"
)

type Money struct {
	Amount   string `json:"amount" bson:"amount"`
	Currency string `json:"currency" bson:"currency"`
}
type Result struct {
	Label string `json:"label" bson:"label"`
	Value string `json:"value" bson:"value"`
}
type Campaign struct {
	PublicID       string     `json:"id" bson:"public_id"`
	EnquiryID      string     `json:"enquiry_id" bson:"enquiry_id"`
	OrganizationID string     `json:"organization_id" bson:"organization_id"`
	Title          string     `json:"title" bson:"title"`
	Objective      string     `json:"objective" bson:"objective"`
	Platforms      []string   `json:"platforms" bson:"platforms"`
	StartsOn       time.Time  `json:"starts_on" bson:"starts_on"`
	EndsOn         time.Time  `json:"ends_on" bson:"ends_on"`
	Status         Status     `json:"status" bson:"status"`
	Fee            Money      `json:"fee" bson:"fee"`
	Expenses       Money      `json:"expenses" bson:"expenses"`
	Results        []Result   `json:"results" bson:"results"`
	AssetIDs       []string   `json:"asset_ids" bson:"asset_ids"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty" bson:"deleted_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at" bson:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" bson:"updated_at"`
}
type Deliverable struct {
	PublicID     string            `json:"id" bson:"public_id"`
	CampaignID   string            `json:"campaign_id" bson:"campaign_id"`
	Title        string            `json:"title" bson:"title"`
	Platform     string            `json:"platform" bson:"platform"`
	Format       string            `json:"format" bson:"format"`
	DueAt        time.Time         `json:"due_at" bson:"due_at"`
	Status       DeliverableStatus `json:"status" bson:"status"`
	PublishedURL string            `json:"published_url" bson:"published_url"`
	Approval     ApprovalStatus    `json:"approval_status" bson:"approval_status"`
	AssetIDs     []string          `json:"asset_ids" bson:"asset_ids"`
	CreatedAt    time.Time         `json:"created_at" bson:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at" bson:"updated_at"`
}
type Input struct {
	EnquiryID      string   `json:"enquiry_id"`
	OrganizationID string   `json:"organization_id"`
	Title          string   `json:"title"`
	Objective      string   `json:"objective"`
	Platforms      []string `json:"platforms"`
	StartsOn       string   `json:"starts_on"`
	EndsOn         string   `json:"ends_on"`
	Status         Status   `json:"status"`
	Fee            Money    `json:"fee"`
	Expenses       Money    `json:"expenses"`
	Results        []Result `json:"results"`
	AssetIDs       []string `json:"asset_ids"`
}
type DeliverableInput struct {
	Title        string            `json:"title"`
	Platform     string            `json:"platform"`
	Format       string            `json:"format"`
	DueAt        string            `json:"due_at"`
	Status       DeliverableStatus `json:"status"`
	PublishedURL string            `json:"published_url"`
	Approval     ApprovalStatus    `json:"approval_status"`
	AssetIDs     []string          `json:"asset_ids"`
}

var publicID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var supportedCurrencies = map[string]bool{"GHS": true, "USD": true, "EUR": true, "GBP": true}
var canonicalMoney = regexp.MustCompile(`^(0|[1-9][0-9]{0,14})\.[0-9]{2}$`)

func validateInput(in Input) (time.Time, time.Time, error) {
	start, e1 := time.Parse("2006-01-02", in.StartsOn)
	end, e2 := time.Parse("2006-01-02", in.EndsOn)
	if !publicID.MatchString(in.EnquiryID) || !publicID.MatchString(in.OrganizationID) || !bounded(in.Title, 2, 160) || !bounded(in.Objective, 2, 2000) || e1 != nil || e2 != nil || end.Before(start) || !validStatus(in.Status) || !validMoney(in.Fee) || !validMoney(in.Expenses) || in.Fee.Currency != in.Expenses.Currency || len(in.Platforms) == 0 || len(in.Platforms) > 20 || len(in.Results) > 50 || len(in.AssetIDs) > 100 {
		return time.Time{}, time.Time{}, ErrInvalid
	}
	for _, value := range in.Platforms {
		if !bounded(strings.TrimSpace(value), 1, 80) {
			return time.Time{}, time.Time{}, ErrInvalid
		}
	}
	if !uniqueStrings(trimAll(in.Platforms)) || !uniqueStrings(in.AssetIDs) {
		return time.Time{}, time.Time{}, ErrInvalid
	}
	for _, value := range in.Results {
		if !bounded(value.Label, 1, 120) || !bounded(value.Value, 1, 240) {
			return time.Time{}, time.Time{}, ErrInvalid
		}
	}
	for _, value := range in.AssetIDs {
		if !publicID.MatchString(value) {
			return time.Time{}, time.Time{}, ErrInvalid
		}
	}
	return start.UTC(), end.UTC(), nil
}
func validateDeliverable(in DeliverableInput) (time.Time, error) {
	due, err := time.Parse(time.RFC3339, in.DueAt)
	if !bounded(in.Title, 2, 160) || !bounded(in.Platform, 1, 80) || !bounded(in.Format, 1, 80) || err != nil || !validDeliverableStatus(in.Status) || !validApproval(in.Approval) || len(in.AssetIDs) > 50 {
		return time.Time{}, ErrInvalid
	}
	if in.PublishedURL != "" {
		parsed, parseErr := url.ParseRequestURI(in.PublishedURL)
		if parseErr != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" {
			return time.Time{}, ErrInvalid
		}
	}
	for _, value := range in.AssetIDs {
		if !publicID.MatchString(value) {
			return time.Time{}, ErrInvalid
		}
	}
	if !uniqueStrings(in.AssetIDs) {
		return time.Time{}, ErrInvalid
	}
	if in.Status == DeliverablePublished && (in.PublishedURL == "" || in.Approval != ApprovalApproved) {
		return time.Time{}, ErrInvalid
	}
	return due.UTC(), nil
}
func validMoney(value Money) bool {
	if !supportedCurrencies[value.Currency] || !canonicalMoney.MatchString(value.Amount) {
		return false
	}
	decimal, err := bson.ParseDecimal128(value.Amount)
	return err == nil && decimal.String() == value.Amount
}
func validStatus(value Status) bool {
	return value == StatusDraft || value == StatusActive || value == StatusPaused || value == StatusCompleted || value == StatusCancelled
}
func validDeliverableStatus(value DeliverableStatus) bool {
	return value == DeliverablePending || value == DeliverableInProgress || value == DeliverableSubmitted || value == DeliverableApproved || value == DeliverablePublished
}
func validApproval(value ApprovalStatus) bool {
	return value == ApprovalPending || value == ApprovalApproved || value == ApprovalRejected
}
func bounded(value string, minimum, maximum int) bool {
	value = strings.TrimSpace(value)
	size := utf8.RuneCountInString(value)
	return utf8.ValidString(value) && size >= minimum && size <= maximum
}

func uniqueStrings(values []string) bool {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if _, exists := seen[value]; exists {
			return false
		}
		seen[value] = struct{}{}
	}
	return true
}
