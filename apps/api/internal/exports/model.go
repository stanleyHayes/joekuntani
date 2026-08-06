package exports

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

type Resource string

const (
	ResourceEnquiries Resource = "enquiries"
	ResourceContacts  Resource = "contacts"
	ResourceBookings  Resource = "bookings"
	ResourceCampaigns Resource = "campaigns"
)

const MaximumRows = 5000

var (
	ErrForbidden   = errors.New("export access forbidden")
	ErrInvalid     = errors.New("invalid export request")
	ErrUnavailable = errors.New("export unavailable")
)

type Actor struct {
	UserID     string
	InternalID string
	Role       auth.Role
}

type Request struct {
	Resource Resource
}

type Row []string

type Result struct {
	Filename string
	Header   []string
	Rows     []Row
}

func (request Request) normalized() (Request, error) {
	request.Resource = Resource(strings.TrimSpace(string(request.Resource)))
	switch request.Resource {
	case ResourceEnquiries, ResourceContacts, ResourceBookings, ResourceCampaigns:
		return request, nil
	default:
		return Request{}, ErrInvalid
	}
}

func allowedResources(role auth.Role) ([]Resource, bool) {
	switch role {
	case auth.RoleAdministrator:
		return []Resource{ResourceEnquiries, ResourceContacts, ResourceBookings, ResourceCampaigns}, true
	case auth.RoleBookingManager:
		return []Resource{ResourceEnquiries, ResourceContacts, ResourceBookings, ResourceCampaigns}, true
	case auth.RoleAnalyst:
		// Analyst may export operational/financial summaries, not CRM contact PII.
		return []Resource{ResourceBookings, ResourceCampaigns}, true
	default:
		return nil, false
	}
}

func allows(role auth.Role, resource Resource) bool {
	resources, ok := allowedResources(role)
	if !ok {
		return false
	}
	for _, candidate := range resources {
		if candidate == resource {
			return true
		}
	}
	return false
}

func safeCell(value string) string {
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if strings.ContainsRune("=+-@", rune(value[0])) {
		return "'" + value
	}
	if !utf8.ValidString(value) {
		return ""
	}
	return value
}

func formatTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}
