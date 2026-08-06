package crm

import (
	"errors"
	"net/mail"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type Stage string

const (
	StageNew           Stage = "new"
	StageReviewing     Stage = "reviewing"
	StageQualified     Stage = "qualified"
	StageCallScheduled Stage = "call_scheduled"
	StageProposalSent  Stage = "proposal_sent"
	StageNegotiation   Stage = "negotiation"
	StageWon           Stage = "won"
	StageLost          Stage = "lost"
	StageArchived      Stage = "archived"
)

var (
	ErrForbidden = errors.New("crm operation forbidden")
	ErrInvalid   = errors.New("invalid crm input")
	ErrNotFound  = errors.New("crm record not found")
	ErrConflict  = errors.New("crm record conflict")
	ErrRetention = errors.New("privacy deletion blocked by lawful retention")
	uuidPattern  = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
)

type Organization struct {
	PublicID             string     `json:"id" bson:"public_id"`
	Name                 string     `json:"name" bson:"name"`
	Website              string     `json:"website,omitempty" bson:"website,omitempty"`
	CountryCode          string     `json:"country_code,omitempty" bson:"country_code,omitempty"`
	NormalizedName       string     `json:"-" bson:"normalized_name"`
	CreatedAt, UpdatedAt time.Time  `json:"-" bson:"-"`
	DeletedAt            *time.Time `json:"deleted_at,omitempty" bson:"deleted_at,omitempty"`
}

type Contact struct {
	PublicID             string     `json:"id" bson:"public_id"`
	OrganizationID       string     `json:"organization_id,omitempty" bson:"organization_id,omitempty"`
	Name                 string     `json:"name" bson:"name"`
	Email                string     `json:"email,omitempty" bson:"email,omitempty"`
	Phone                string     `json:"phone,omitempty" bson:"phone,omitempty"`
	Role                 string     `json:"role,omitempty" bson:"role,omitempty"`
	CountryCode          string     `json:"country_code,omitempty" bson:"country_code,omitempty"`
	NormalizedEmail      string     `json:"-" bson:"normalized_email,omitempty"`
	NormalizedPhone      string     `json:"-" bson:"normalized_phone,omitempty"`
	CreatedAt, UpdatedAt time.Time  `json:"-" bson:"-"`
	DeletedAt            *time.Time `json:"deleted_at,omitempty" bson:"deleted_at,omitempty"`
}

type Enquiry struct {
	PublicID        string     `json:"id" bson:"public_id"`
	SourceEnquiryID string     `json:"source_enquiry_id" bson:"source_enquiry_id"`
	Reference       string     `json:"reference" bson:"reference"`
	ContactID       string     `json:"contact_id" bson:"contact_id"`
	OrganizationID  string     `json:"organization_id" bson:"organization_id"`
	ServiceID       string     `json:"service_id" bson:"service_id"`
	OwnerID         string     `json:"owner_id" bson:"owner_id"`
	Stage           Stage      `json:"stage" bson:"stage"`
	Source          string     `json:"source" bson:"source"`
	EnquiryType     string     `json:"enquiry_type" bson:"enquiry_type"`
	Summary         string     `json:"summary" bson:"summary"`
	CreatedAt       time.Time  `json:"created_at" bson:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" bson:"updated_at"`
	DeletedAt       *time.Time `json:"deleted_at,omitempty" bson:"deleted_at,omitempty"`
}

type SavedView struct {
	PublicID  string        `json:"id" bson:"public_id"`
	OwnerID   string        `json:"owner_id" bson:"owner_id"`
	Name      string        `json:"name" bson:"name"`
	Filter    EnquiryFilter `json:"filter" bson:"filter"`
	CreatedAt time.Time     `json:"created_at" bson:"created_at"`
	UpdatedAt time.Time     `json:"updated_at" bson:"updated_at"`
}

type EnquiryFilter struct {
	Stages         []Stage  `json:"stages" bson:"stages"`
	OwnerID        string   `json:"owner_id" bson:"owner_id"`
	Sources        []string `json:"sources" bson:"sources"`
	ServiceID      string   `json:"service_id" bson:"service_id"`
	OrganizationID string   `json:"organization_id" bson:"organization_id"`
	Query          string   `json:"query" bson:"query"`
	IncludeDeleted bool     `json:"include_deleted" bson:"include_deleted"`
}

type OrganizationInput struct{ Name, Website, CountryCode string }
type ContactInput struct{ OrganizationID, Name, Email, Phone, Role, CountryCode string }
type EnquiryInput struct{ SourceEnquiryID, ContactID, OrganizationID, OwnerID, Summary string }

type SourceEnquiry struct {
	PublicID, Reference, ServiceID, Source, EnquiryType string
	Contact                                             SourceContact
}
type SourceContact struct{ Name, Email, Phone, Organization, Role, Country string }

type PrivacyExport struct {
	Contact      Contact
	Organization *Organization
	Enquiries    []Enquiry
	ExportedAt   time.Time
}

type PrivacyDeleteResult struct{ Contacts, Organizations, Enquiries int }

func (input *OrganizationInput) normalize() {
	input.Name, input.Website = collapseSpace(input.Name), strings.TrimSpace(input.Website)
	input.CountryCode = strings.ToUpper(strings.TrimSpace(input.CountryCode))
}
func (input OrganizationInput) validate() error {
	if !bounded(input.Name, 2, 160) || !bounded(input.Website, 0, 2048) || !country(input.CountryCode, false) {
		return ErrInvalid
	}
	if input.Website != "" && !strings.HasPrefix(input.Website, "https://") {
		return ErrInvalid
	}
	return nil
}

func (input *ContactInput) normalize() {
	input.OrganizationID, input.Name, input.Email = strings.TrimSpace(input.OrganizationID), strings.TrimSpace(input.Name), normalizeEmail(input.Email)
	input.Phone, input.Role = normalizePhone(input.Phone), strings.TrimSpace(input.Role)
	input.CountryCode = strings.ToUpper(strings.TrimSpace(input.CountryCode))
}
func (input ContactInput) validate() error {
	if !bounded(input.Name, 2, 120) || !bounded(input.Role, 0, 120) || !country(input.CountryCode, false) || (input.Email == "" && input.Phone == "") {
		return ErrInvalid
	}
	if input.OrganizationID != "" && !validID(input.OrganizationID) {
		return ErrInvalid
	}
	if input.Email != "" {
		address, err := mail.ParseAddress(input.Email)
		if err != nil || address.Address != input.Email || len(input.Email) > 254 {
			return ErrInvalid
		}
	}
	if input.Phone != "" && (len(input.Phone) < 7 || len(input.Phone) > 20) {
		return ErrInvalid
	}
	return nil
}
func (input *EnquiryInput) normalize() {
	input.SourceEnquiryID, input.ContactID = strings.TrimSpace(input.SourceEnquiryID), strings.TrimSpace(input.ContactID)
	input.OrganizationID, input.OwnerID, input.Summary = strings.TrimSpace(input.OrganizationID), strings.TrimSpace(input.OwnerID), strings.TrimSpace(input.Summary)
}
func (input EnquiryInput) validate() error {
	if !validID(input.SourceEnquiryID) || !validID(input.ContactID) || (input.OrganizationID != "" && !validID(input.OrganizationID)) || (input.OwnerID != "" && !validID(input.OwnerID)) || !bounded(input.Summary, 0, 2000) {
		return ErrInvalid
	}
	return nil
}

func normalizeEmail(value string) string            { return strings.ToLower(strings.TrimSpace(value)) }
func normalizeOrganizationName(value string) string { return strings.ToLower(collapseSpace(value)) }
func collapseSpace(value string) string             { return strings.Join(strings.Fields(value), " ") }
func normalizePhone(value string) string {
	value = strings.TrimSpace(value)
	var out strings.Builder
	for i, r := range value {
		if unicode.IsDigit(r) || (r == '+' && i == 0) {
			out.WriteRune(r)
		}
	}
	return out.String()
}
func validID(value string) bool { return uuidPattern.MatchString(value) }
func country(value string, required bool) bool {
	if value == "" {
		return !required
	}
	return len(value) == 2 && value[0] >= 'A' && value[0] <= 'Z' && value[1] >= 'A' && value[1] <= 'Z'
}
func bounded(value string, minimum, maximum int) bool {
	n := utf8.RuneCountInString(value)
	return utf8.ValidString(value) && n >= minimum && n <= maximum && len(value) <= maximum
}
func validStage(stage Stage) bool {
	return stage == StageNew || stage == StageReviewing || stage == StageQualified || stage == StageCallScheduled || stage == StageProposalSent || stage == StageNegotiation || stage == StageWon || stage == StageLost || stage == StageArchived
}
