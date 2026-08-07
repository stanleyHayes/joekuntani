// Package support implements audience donations ("support the artist").
//
// A donation is a one-off payment with no fulfilment: there is nothing to
// reserve, issue or check in. It reuses the shared payments.PaymentProvider so
// Paystack configuration lives in exactly one place, but keeps its own store,
// reference space and lifecycle so it can never touch ticket inventory.
package support

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/payments"
)

var (
	ErrInvalid     = errors.New("invalid donation request")
	ErrUnavailable = errors.New("donations unavailable")
	ErrNotFound    = errors.New("donation not found")
)

// ReferencePrefix distinguishes donation references from ticket order
// references so a single provider webhook endpoint can route both.
const ReferencePrefix = "JKD-"

// Amount bounds, expressed in major currency units. The floor keeps card fees
// from swallowing the gift; the ceiling is a fat-finger guard.
const (
	MinAmountMinorUnits = 500     // GHS 5.00
	MaxAmountMinorUnits = 5000000 // GHS 50,000.00
)

// Donation is one audience contribution.
type Donation struct {
	PublicID   string     `json:"id"`
	Reference  string     `json:"reference"`
	Amount     string     `json:"amount"`
	Currency   string     `json:"currency"`
	DonorName  string     `json:"donor_name"`
	DonorEmail string     `json:"-"`
	Message    string     `json:"message"`
	Anonymous  bool       `json:"anonymous"`
	Status     string     `json:"status"`
	CreatedAt  time.Time  `json:"created_at"`
	PaidAt     *time.Time `json:"paid_at,omitempty"`
}

// CreateInput is the public request shape.
type CreateInput struct {
	Amount    string
	Currency  string
	Name      string
	Email     string
	Message   string
	Anonymous bool
}

type Store interface {
	Create(context.Context, Donation) error
	SaveCheckout(ctx context.Context, reference, provider string, session payments.CheckoutSession, now time.Time) error
	ApplyWebhook(ctx context.Context, provider string, event payments.VerifiedEvent, bodyHash string, now time.Time) (bool, error)
	List(ctx context.Context, limit int) ([]Donation, Totals, error)
}

// Totals summarises confirmed giving for the admin surface.
type Totals struct {
	Currency string `json:"currency"`
	Count    int    `json:"count"`
	Total    string `json:"total"`
}

type Service struct {
	store      Store
	provider   payments.PaymentProvider
	returnBase string
	currency   string
	now        func() time.Time
}

func NewService(store Store, provider payments.PaymentProvider, returnBase, currency string) (*Service, error) {
	if store == nil || provider == nil {
		return nil, ErrInvalid
	}
	parsed, err := url.Parse(returnBase)
	if err != nil || parsed.Host == "" {
		return nil, ErrInvalid
	}
	host := strings.ToLower(parsed.Hostname())
	loopback := host == "localhost" || host == "127.0.0.1" || host == "::1"
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && loopback) {
		return nil, ErrInvalid
	}
	currency = strings.ToUpper(strings.TrimSpace(currency))
	if len(currency) != 3 {
		currency = "GHS"
	}
	return &Service{
		store:      store,
		provider:   provider,
		returnBase: strings.TrimRight(returnBase, "/"),
		currency:   currency,
		now:        time.Now,
	}, nil
}

// Currency exposes the configured donation currency for the public surface.
func (s *Service) Currency() string { return s.currency }

// Enabled reports whether a real payment provider is configured. Without one
// the service fails closed, so the public surface should say so up front rather
// than offering a form that can only end in an error.
func (s *Service) Enabled() bool {
	return s.provider != nil && s.provider.Name() != "unconfigured"
}

// Create records a pending donation and hands back a provider checkout URL.
func (s *Service) Create(ctx context.Context, input CreateInput) (Donation, string, error) {
	amount, err := normalizeAmount(input.Amount)
	if err != nil {
		return Donation{}, "", err
	}
	email := strings.TrimSpace(input.Email)
	if !validEmail(email) {
		return Donation{}, "", ErrInvalid
	}
	name := clip(strings.TrimSpace(input.Name), 120)
	message := clip(strings.TrimSpace(input.Message), 500)
	currency := strings.ToUpper(strings.TrimSpace(input.Currency))
	if currency == "" {
		currency = s.currency
	}
	if currency != s.currency {
		return Donation{}, "", ErrInvalid
	}

	now := s.now().UTC()
	reference, err := newReference(now)
	if err != nil {
		return Donation{}, "", ErrUnavailable
	}
	publicID, err := newUUID()
	if err != nil {
		return Donation{}, "", ErrUnavailable
	}
	donation := Donation{
		PublicID:   publicID,
		Reference:  reference,
		Amount:     amount,
		Currency:   currency,
		DonorName:  name,
		DonorEmail: email,
		Message:    message,
		Anonymous:  input.Anonymous,
		Status:     "pending",
		CreatedAt:  now,
	}
	if err = s.store.Create(ctx, donation); err != nil {
		return Donation{}, "", ErrUnavailable
	}

	session, err := s.provider.CreateCheckout(ctx, payments.CheckoutRequest{
		IdempotencyKey: donation.PublicID,
		OrderReference: donation.Reference,
		Currency:       donation.Currency,
		Amount:         donation.Amount,
		PayerEmail:     donation.DonorEmail,
		ReturnURL:      s.returnBase + "/support/thank-you?reference=" + url.QueryEscape(donation.Reference),
	})
	if err != nil {
		return Donation{}, "", ErrUnavailable
	}
	parsed, parseErr := url.Parse(session.URL)
	if parseErr != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return Donation{}, "", ErrUnavailable
	}
	if err = s.store.SaveCheckout(ctx, donation.Reference, s.provider.Name(), session, now); err != nil {
		return Donation{}, "", ErrUnavailable
	}
	return donation, session.URL, nil
}

// ApplyWebhook records a verified provider event against a donation. The
// payments service performs signature verification before delegating here.
func (s *Service) ApplyWebhook(ctx context.Context, provider string, event payments.VerifiedEvent, bodyHash string) (bool, error) {
	if !IsDonationReference(event.OrderReference) {
		return false, ErrInvalid
	}
	return s.store.ApplyWebhook(ctx, provider, event, bodyHash, s.now().UTC())
}

// List returns recent donations plus confirmed totals for the admin surface.
func (s *Service) List(ctx context.Context, limit int) ([]Donation, Totals, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	return s.store.List(ctx, limit)
}

// IsDonationReference reports whether a provider reference belongs to a
// donation rather than a ticket order.
func IsDonationReference(reference string) bool {
	return len(reference) == 17 && strings.HasPrefix(reference, ReferencePrefix)
}

// normalizeAmount validates a major-unit decimal string and returns it in a
// canonical two-decimal form so the stored value and the charged value agree.
func normalizeAmount(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", ErrInvalid
	}
	whole, fraction, hasFraction := strings.Cut(raw, ".")
	if whole == "" || len(whole) > 9 {
		return "", ErrInvalid
	}
	if hasFraction {
		if len(fraction) > 2 {
			return "", ErrInvalid
		}
		fraction += strings.Repeat("0", 2-len(fraction))
	} else {
		fraction = "00"
	}
	for _, part := range []string{whole, fraction} {
		for _, character := range part {
			if character < '0' || character > '9' {
				return "", ErrInvalid
			}
		}
	}
	minor, err := strconv.ParseInt(whole+fraction, 10, 64)
	if err != nil || minor < MinAmountMinorUnits || minor > MaxAmountMinorUnits {
		return "", ErrInvalid
	}
	if whole = strings.TrimLeft(whole, "0"); whole == "" {
		whole = "0"
	}
	return whole + "." + fraction, nil
}

func validEmail(email string) bool {
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 || len(email) > 254 {
		return false
	}
	return !strings.ContainsAny(email, " \t\r\n")
}

func clip(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max]
}

func newReference(now time.Time) (string, error) {
	buffer := make([]byte, 5)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return fmt.Sprintf("%s%04d-%s", ReferencePrefix, now.Year(), hex.EncodeToString(buffer)[:8]), nil
}

func newUUID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	buffer[6] = (buffer[6] & 0x0f) | 0x40
	buffer[8] = (buffer[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", buffer[:4], buffer[4:6], buffer[6:8], buffer[8:10], buffer[10:]), nil
}
