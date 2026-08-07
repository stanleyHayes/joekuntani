package support

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/payments"
)

type stubStore struct {
	created      []Donation
	savedSession payments.CheckoutSession
	savedRef     string
	applied      []payments.VerifiedEvent
	createErr    error
}

func (s *stubStore) Create(_ context.Context, donation Donation) error {
	if s.createErr != nil {
		return s.createErr
	}
	s.created = append(s.created, donation)
	return nil
}

func (s *stubStore) SaveCheckout(_ context.Context, reference, _ string, session payments.CheckoutSession, _ time.Time) error {
	s.savedRef = reference
	s.savedSession = session
	return nil
}

func (s *stubStore) ApplyWebhook(_ context.Context, _ string, event payments.VerifiedEvent, _ string, _ time.Time) (bool, error) {
	s.applied = append(s.applied, event)
	return true, nil
}

func (s *stubStore) List(context.Context, int) ([]Donation, Totals, error) {
	return nil, Totals{}, nil
}

func newService(t *testing.T, store Store, provider payments.PaymentProvider) *Service {
	t.Helper()
	service, err := NewService(store, provider, "https://joekuntani.com", "GHS")
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	return service
}

func okProvider() *paystackStub {
	return &paystackStub{session: payments.CheckoutSession{
		ID:        "session-1",
		URL:       "https://checkout.paystack.com/xyz",
		ExpiresAt: time.Now().Add(30 * time.Minute),
	}}
}

// paystackStub satisfies payments.PaymentProvider with the full signature set.
type paystackStub struct {
	session payments.CheckoutSession
	err     error
	last    payments.CheckoutRequest
}

func (p *paystackStub) Name() string { return "stub" }
func (p *paystackStub) CreateCheckout(_ context.Context, request payments.CheckoutRequest) (payments.CheckoutSession, error) {
	p.last = request
	return p.session, p.err
}
func (p *paystackStub) VerifyWebhook(http.Header, []byte) (payments.VerifiedEvent, error) {
	return payments.VerifiedEvent{}, nil
}
func (p *paystackStub) GetPaymentStatus(context.Context, string) (payments.PaymentStatus, error) {
	return payments.PaymentStatus{}, nil
}
func (p *paystackStub) Refund(context.Context, payments.RefundRequest) (payments.RefundResult, error) {
	return payments.RefundResult{}, nil
}

func TestNormalizeAmountBounds(t *testing.T) {
	valid := map[string]string{
		"5":      "5.00",
		"20.5":   "20.50",
		"100.00": "100.00",
		"050":    "50.00",
	}
	for input, want := range valid {
		got, err := normalizeAmount(input)
		if err != nil || got != want {
			t.Errorf("normalizeAmount(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
	for _, input := range []string{"", "4.99", "0", "-10", "abc", "1.234", "50001.00", "99999999.00"} {
		if _, err := normalizeAmount(input); !errors.Is(err, ErrInvalid) {
			t.Errorf("normalizeAmount(%q) should be rejected", input)
		}
	}
}

func TestIsDonationReference(t *testing.T) {
	if !IsDonationReference("JKD-2026-abcdef12") {
		t.Error("donation reference must be recognised")
	}
	if IsDonationReference("JKT-2026-abcdef12") {
		t.Error("ticket reference must not be treated as a donation")
	}
	if IsDonationReference("JKD-2026") {
		t.Error("short reference must be rejected")
	}
}

func TestCreateStoresPendingDonationAndReturnsCheckoutURL(t *testing.T) {
	store := &stubStore{}
	provider := okProvider()
	service := newService(t, store, provider)

	donation, checkoutURL, err := service.Create(context.Background(), CreateInput{
		Amount: "50", Email: "fan@example.com", Name: "A Fan", Message: "Love the work",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if checkoutURL != "https://checkout.paystack.com/xyz" {
		t.Errorf("checkoutURL = %q", checkoutURL)
	}
	if len(store.created) != 1 || store.created[0].Status != "pending" {
		t.Fatalf("expected one pending donation, got %+v", store.created)
	}
	if donation.Amount != "50.00" {
		t.Errorf("amount = %q; want canonical 50.00", donation.Amount)
	}
	if !IsDonationReference(donation.Reference) {
		t.Errorf("reference %q must use the donation prefix", donation.Reference)
	}
	if provider.last.PayerEmail != "fan@example.com" {
		t.Errorf("payer email = %q", provider.last.PayerEmail)
	}
	if provider.last.Amount != "50.00" || provider.last.Currency != "GHS" {
		t.Errorf("provider charged %s %s", provider.last.Currency, provider.last.Amount)
	}
	if store.savedRef != donation.Reference {
		t.Errorf("checkout saved against %q, want %q", store.savedRef, donation.Reference)
	}
}

func TestCreateRejectsBadInput(t *testing.T) {
	service := newService(t, &stubStore{}, okProvider())
	cases := map[string]CreateInput{
		"below minimum":  {Amount: "1", Email: "fan@example.com"},
		"no email":       {Amount: "50"},
		"bad email":      {Amount: "50", Email: "not-an-email"},
		"wrong currency": {Amount: "50", Email: "fan@example.com", Currency: "USD"},
	}
	for name, input := range cases {
		t.Run(name, func(t *testing.T) {
			if _, _, err := service.Create(context.Background(), input); !errors.Is(err, ErrInvalid) {
				t.Fatalf("expected ErrInvalid, got %v", err)
			}
		})
	}
}

func TestCreateRejectsPlaintextCheckoutURL(t *testing.T) {
	provider := okProvider()
	provider.session.URL = "http://checkout.paystack.com/xyz"
	service := newService(t, &stubStore{}, provider)

	if _, _, err := service.Create(context.Background(), CreateInput{Amount: "50", Email: "fan@example.com"}); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("expected ErrUnavailable, got %v", err)
	}
}

func TestApplyWebhookRejectsTicketReferences(t *testing.T) {
	store := &stubStore{}
	service := newService(t, store, okProvider())

	_, err := service.ApplyWebhook(context.Background(), "stub", payments.VerifiedEvent{
		ID: "evt-1", Type: "payment.succeeded", OrderReference: "JKT-2026-abcdef12",
	}, "hash")
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("ticket references must not reach the donation store, got %v", err)
	}
	if len(store.applied) != 0 {
		t.Error("store must not be touched for ticket references")
	}
}

func TestApplyWebhookAcceptsDonationReferences(t *testing.T) {
	store := &stubStore{}
	service := newService(t, store, okProvider())

	applied, err := service.ApplyWebhook(context.Background(), "stub", payments.VerifiedEvent{
		ID: "evt-1", Type: "payment.succeeded", OrderReference: "JKD-2026-abcdef12",
	}, "hash")
	if err != nil || !applied {
		t.Fatalf("ApplyWebhook = %v, %v", applied, err)
	}
	if len(store.applied) != 1 {
		t.Fatalf("expected the event to reach the store, got %d", len(store.applied))
	}
}

func TestNewServiceRejectsPlaintextReturnBase(t *testing.T) {
	if _, err := NewService(&stubStore{}, okProvider(), "http://joekuntani.com", "GHS"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("plaintext non-loopback return base must be rejected, got %v", err)
	}
	if _, err := NewService(&stubStore{}, okProvider(), "http://localhost:3000", "GHS"); err != nil {
		t.Fatalf("loopback return base should be allowed for local dev, got %v", err)
	}
}
