package audit

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

const (
	DefaultLimit = 50
	MaximumLimit = 100
)

var (
	ErrForbidden   = errors.New("audit access forbidden")
	ErrInvalid     = errors.New("invalid audit query")
	ErrUnavailable = errors.New("audit unavailable")
)

type Actor struct {
	UserID string
	Role   auth.Role
}

type Query struct {
	Text       string
	Action     string
	EntityType string
	From       *time.Time
	To         *time.Time
	Limit      int
}

type Entry struct {
	ID         string    `json:"id"`
	Action     string    `json:"action"`
	EntityType string    `json:"entity_type"`
	EntityID   string    `json:"entity_id"`
	Outcome    string    `json:"outcome,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type Response struct {
	Query   string  `json:"query"`
	Items   []Entry `json:"items"`
	Limited bool    `json:"limited"`
}

func (query Query) normalized() (Query, error) {
	query.Text = strings.Join(strings.Fields(query.Text), " ")
	query.Action = strings.TrimSpace(query.Action)
	query.EntityType = strings.TrimSpace(query.EntityType)
	if query.Limit == 0 {
		query.Limit = DefaultLimit
	}
	if !utf8.ValidString(query.Text) || utf8.RuneCountInString(query.Text) > 100 {
		return Query{}, ErrInvalid
	}
	if !utf8.ValidString(query.Action) || utf8.RuneCountInString(query.Action) > 80 {
		return Query{}, ErrInvalid
	}
	if !utf8.ValidString(query.EntityType) || utf8.RuneCountInString(query.EntityType) > 80 {
		return Query{}, ErrInvalid
	}
	if query.Limit < 1 || query.Limit > MaximumLimit {
		return Query{}, ErrInvalid
	}
	if query.From != nil && query.To != nil && query.To.Before(*query.From) {
		return Query{}, ErrInvalid
	}
	return query, nil
}

func canRead(role auth.Role) bool {
	return role == auth.RoleAdministrator
}
