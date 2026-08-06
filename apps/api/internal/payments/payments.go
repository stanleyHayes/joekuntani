package payments

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var (
	ErrInvalid     = errors.New("invalid payment request")
	ErrForbidden   = errors.New("payment access denied")
	ErrConflict    = errors.New("payment state conflict")
	ErrUnavailable = errors.New("payment provider unavailable")
)

type CheckoutRequest struct{ IdempotencyKey, OrderReference, Currency, Amount, ReturnURL string }
type CheckoutSession struct {
	ID, URL   string
	ExpiresAt time.Time
}
type VerifiedEvent struct{ ID, Type, OrderReference, PaymentReference, FailureCode string }
type PaymentStatus struct{ Reference, Status string }
type RefundRequest struct{ PaymentReference, Amount, Currency, Reason, IdempotencyKey string }
type RefundResult struct{ Reference, Status string }
type PaymentProvider interface {
	Name() string
	CreateCheckout(context.Context, CheckoutRequest) (CheckoutSession, error)
	VerifyWebhook(http.Header, []byte) (VerifiedEvent, error)
	GetPaymentStatus(context.Context, string) (PaymentStatus, error)
	Refund(context.Context, RefundRequest) (RefundResult, error)
}
type UnavailableProvider struct{}

func (UnavailableProvider) Name() string { return "unconfigured" }
func (UnavailableProvider) CreateCheckout(context.Context, CheckoutRequest) (CheckoutSession, error) {
	return CheckoutSession{}, ErrUnavailable
}
func (UnavailableProvider) VerifyWebhook(http.Header, []byte) (VerifiedEvent, error) {
	return VerifiedEvent{}, ErrUnavailable
}
func (UnavailableProvider) GetPaymentStatus(context.Context, string) (PaymentStatus, error) {
	return PaymentStatus{}, ErrUnavailable
}
func (UnavailableProvider) Refund(context.Context, RefundRequest) (RefundResult, error) {
	return RefundResult{}, ErrUnavailable
}

type Order struct {
	PublicID, Reference, EventID, Currency, Total, IdempotencyHash string
	Status                                                         string
	HoldExpiresAt                                                  time.Time
	CheckoutSession                                                *CheckoutSession
}
type Store interface {
	CheckoutOrder(context.Context, string, string, time.Time) (Order, error)
	SaveCheckout(context.Context, Order, string, CheckoutSession, time.Time) error
	ApplyWebhook(context.Context, string, VerifiedEvent, string, time.Time) (bool, error)
}
type Telemetry interface {
	CheckoutCreated(string, string)
	PaymentCompleted(string)
	PaymentFailed(string, string)
}
type Service struct {
	store      Store
	provider   PaymentProvider
	now        func() time.Time
	returnBase string
	telemetry  Telemetry
}

func NewService(store Store, provider PaymentProvider, returnBase string, telemetry Telemetry) (*Service, error) {
	u, err := url.Parse(returnBase)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, ErrInvalid
	}
	host := strings.ToLower(u.Hostname())
	loopback := host == "localhost" || host == "127.0.0.1" || host == "::1"
	if u.Scheme != "https" && !(u.Scheme == "http" && loopback) {
		return nil, ErrInvalid
	}
	return &Service{store: store, provider: provider, now: time.Now, returnBase: strings.TrimRight(returnBase, "/"), telemetry: telemetry}, nil
}
func (s *Service) Checkout(ctx context.Context, reference, accessKey string) (CheckoutSession, error) {
	if len(accessKey) < 16 || len(accessKey) > 128 || !validReference(reference) {
		return CheckoutSession{}, ErrInvalid
	}
	digest := sha256.Sum256([]byte(strings.TrimSpace(accessKey)))
	order, err := s.store.CheckoutOrder(ctx, reference, hex.EncodeToString(digest[:]), s.now().UTC())
	if err != nil {
		return CheckoutSession{}, err
	}
	if order.CheckoutSession != nil && order.CheckoutSession.ExpiresAt.After(s.now().UTC()) {
		return *order.CheckoutSession, nil
	}
	session, err := s.provider.CreateCheckout(ctx, CheckoutRequest{IdempotencyKey: order.PublicID, OrderReference: order.Reference, Currency: order.Currency, Amount: order.Total, ReturnURL: s.returnBase + "/tickets/checkout?reference=" + url.QueryEscape(order.Reference)})
	if err != nil {
		return CheckoutSession{}, ErrUnavailable
	}
	u, err := url.Parse(session.URL)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || !session.ExpiresAt.After(s.now().UTC()) {
		return CheckoutSession{}, ErrUnavailable
	}
	if err = s.store.SaveCheckout(ctx, order, s.provider.Name(), session, s.now().UTC()); err != nil {
		return CheckoutSession{}, err
	}
	if s.telemetry != nil {
		s.telemetry.CheckoutCreated(order.Reference, order.EventID)
	}
	return session, nil
}
func (s *Service) Webhook(ctx context.Context, headers http.Header, body []byte) (bool, error) {
	if len(body) == 0 || len(body) > 1<<20 {
		return false, ErrInvalid
	}
	event, err := s.provider.VerifyWebhook(headers, body)
	if err != nil {
		return false, ErrForbidden
	}
	if event.ID == "" || !validReference(event.OrderReference) {
		return false, ErrInvalid
	}
	h := sha256.Sum256(body)
	applied, err := s.store.ApplyWebhook(ctx, s.provider.Name(), event, hex.EncodeToString(h[:]), s.now().UTC())
	if err == nil && applied && s.telemetry != nil {
		if event.Type == "payment.succeeded" {
			s.telemetry.PaymentCompleted(event.OrderReference)
		} else if event.Type == "payment.failed" {
			s.telemetry.PaymentFailed(event.OrderReference, event.FailureCode)
		}
	}
	return applied, err
}
func secureEqual(a, b string) bool {
	return len(a) == len(b) && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
func validReference(v string) bool { return len(v) == 17 && strings.HasPrefix(v, "JKT-") }
