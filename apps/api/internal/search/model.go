package search

import (
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

const (
	DefaultLimit = 10
	MaximumLimit = 25
)

type Kind string

const (
	KindEnquiry  Kind = "enquiry"
	KindContact  Kind = "contact"
	KindCampaign Kind = "campaign"
	KindBooking  Kind = "booking"
	KindContent  Kind = "content"
)

var (
	ErrForbidden = errors.New("search access forbidden")
	ErrInvalid   = errors.New("invalid search query")
	publicID     = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
)

type Actor struct {
	UserID string
	Role   auth.Role
}

type Query struct {
	Text  string
	Limit int
}

type Result struct {
	ID      string  `json:"id"`
	Kind    Kind    `json:"kind"`
	Title   string  `json:"title"`
	Context string  `json:"context"`
	Href    string  `json:"href"`
	Score   float64 `json:"-"`
}

type Response struct {
	Query   string   `json:"query"`
	Items   []Result `json:"items"`
	Limited bool     `json:"limited"`
}

func (query Query) normalized() (Query, error) {
	query.Text = strings.Join(strings.Fields(query.Text), " ")
	if query.Limit == 0 {
		query.Limit = DefaultLimit
	}
	if !utf8.ValidString(query.Text) || utf8.RuneCountInString(query.Text) < 2 || utf8.RuneCountInString(query.Text) > 100 || query.Limit < 1 || query.Limit > MaximumLimit {
		return Query{}, ErrInvalid
	}
	return query, nil
}

func allowedKinds(role auth.Role) ([]Kind, bool) {
	switch role {
	case auth.RoleAdministrator:
		return []Kind{KindEnquiry, KindContact, KindCampaign, KindBooking, KindContent}, true
	case auth.RoleBookingManager:
		return []Kind{KindEnquiry, KindContact, KindCampaign, KindBooking}, true
	case auth.RoleContentEditor:
		return []Kind{KindContent}, true
	case auth.RoleAnalyst:
		return []Kind{KindCampaign, KindBooking, KindContent}, true
	default:
		return nil, false
	}
}

func validResult(item Result) bool {
	if !publicID.MatchString(item.ID) {
		return false
	}
	return item.Kind != "" && strings.TrimSpace(item.Title) != "" && strings.HasPrefix(item.Href, "/admin/")
}
