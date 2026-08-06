package privacy

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

const (
	DefaultRetentionMonths = 24
	MaximumBatch           = 100
	anonymizedName         = "Retention expired"
	anonymizedEmail        = "deleted@example.invalid"
)

var (
	ErrForbidden   = errors.New("privacy access forbidden")
	ErrInvalid     = errors.New("invalid privacy request")
	ErrNotFound    = errors.New("privacy record not found")
	ErrConflict    = errors.New("privacy record conflict")
	ErrRetention   = errors.New("privacy deletion blocked by lawful retention")
	ErrUnavailable = errors.New("privacy service unavailable")
	uuidPattern    = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
)

type Actor struct {
	UserID     string
	InternalID string
	Role       auth.Role
}

type Hold struct {
	PublicID  string     `json:"id"`
	ContactID string     `json:"contact_id"`
	Reason    string     `json:"reason"`
	CreatedAt time.Time  `json:"created_at"`
	ClearedAt *time.Time `json:"cleared_at,omitempty"`
}

type HoldInput struct {
	ContactID string `json:"contact_id"`
	Reason    string `json:"reason"`
}

type Status struct {
	RetentionMonths int       `json:"retention_months"`
	EligibleCount   int       `json:"eligible_count"`
	ActiveHolds     int       `json:"active_holds"`
	GeneratedAt     time.Time `json:"generated_at"`
}

type RetentionResult struct {
	Purged    int       `json:"purged"`
	Skipped   int       `json:"skipped"`
	CutoffAt  time.Time `json:"cutoff_at"`
	Completed time.Time `json:"completed_at"`
}

type EnquiryCandidate struct {
	PublicID  string
	ContactID string
	Email     string
	UpdatedAt time.Time
}

func (input HoldInput) normalized() (HoldInput, error) {
	input.ContactID = strings.TrimSpace(strings.ToLower(input.ContactID))
	input.Reason = strings.Join(strings.Fields(input.Reason), " ")
	if !uuidPattern.MatchString(input.ContactID) {
		return HoldInput{}, ErrInvalid
	}
	if !utf8.ValidString(input.Reason) || utf8.RuneCountInString(input.Reason) < 8 || utf8.RuneCountInString(input.Reason) > 500 {
		return HoldInput{}, ErrInvalid
	}
	return input, nil
}

func canAdminister(role auth.Role) bool {
	return role == auth.RoleAdministrator
}

func validID(id string) bool {
	return uuidPattern.MatchString(strings.TrimSpace(strings.ToLower(id)))
}
