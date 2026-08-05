package ticketops

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/payments"
)

type fakeStore struct {
	intent    Refund
	payment   string
	completed int
	resend    int
	idemHash  string
}

func (f *fakeStore) ListOrders(context.Context, OrderFilter) ([]OrderView, []Summary, error) {
	return nil, nil, nil
}
func (f *fakeStore) Resend(context.Context, string, string, time.Time) error           { f.resend++; return nil }
func (*fakeStore) VoidTicket(context.Context, string, string, string, time.Time) error { return nil }
func (f *fakeStore) BeginRefund(_ context.Context, in RefundInput, _, _ string, at time.Time) (Refund, string, error) {
	f.idemHash = in.IdempotencyKey
	if f.intent.ID != "" {
		v := f.intent
		v.Replay = true
		return v, f.payment, nil
	}
	f.intent = Refund{ID: "00000000-0000-4000-8000-000000000001", OrderID: in.OrderID, Amount: in.Amount, Currency: "GHS", Reason: in.Reason, Status: "processing", CreatedAt: at}
	f.payment = "pay_1"
	return f.intent, f.payment, nil
}
func (f *fakeStore) CompleteRefund(_ context.Context, id, status, reference, _, _ string, at time.Time) (Refund, error) {
	f.completed++
	f.intent.ID = id
	f.intent.Status = status
	f.intent.ProviderReference = reference
	f.intent.UpdatedAt = at
	return f.intent, nil
}
func (*fakeStore) Attendees(context.Context, string, string, time.Time) ([]Attendee, error) {
	return nil, nil
}
func (*fakeStore) CancelEvent(context.Context, string, string, string, time.Time) (int, error) {
	return 2, nil
}

type fakeProvider struct {
	calls   int
	err     error
	idemKey string
}

func (*fakeProvider) Name() string { return "fake" }
func (*fakeProvider) CreateCheckout(context.Context, payments.CheckoutRequest) (payments.CheckoutSession, error) {
	return payments.CheckoutSession{}, nil
}
func (*fakeProvider) VerifyWebhook(http.Header, []byte) (payments.VerifiedEvent, error) {
	return payments.VerifiedEvent{}, nil
}
func (*fakeProvider) GetPaymentStatus(context.Context, string) (payments.PaymentStatus, error) {
	return payments.PaymentStatus{}, nil
}
func (p *fakeProvider) Refund(_ context.Context, r payments.RefundRequest) (payments.RefundResult, error) {
	p.calls++
	p.idemKey = r.IdempotencyKey
	if p.err != nil {
		return payments.RefundResult{}, p.err
	}
	return payments.RefundResult{Reference: "refund_1", Status: "pending"}, nil
}
func TestRefundIsIdempotentAndProviderBacked(t *testing.T) {
	store := &fakeStore{}
	provider := &fakeProvider{}
	service := NewService(store, provider, nil)
	service.now = func() time.Time { return time.Date(2026, 8, 5, 17, 0, 0, 0, time.UTC) }
	input := RefundInput{OrderID: "00000000-0000-4000-8000-000000000099", Amount: "25.00", Reason: " Customer request ", IdempotencyKey: "0123456789abcdef"}
	first, e := service.Refund(t.Context(), "actor", input)
	if e != nil || first.Status != "pending" || provider.calls != 1 || store.completed != 1 {
		t.Fatalf("first=%#v calls=%d completed=%d err=%v", first, provider.calls, store.completed, e)
	}
	if store.idemHash == input.IdempotencyKey || len(store.idemHash) != 64 || provider.idemKey != store.idemHash {
		t.Fatalf("idempotency key was not consistently hashed: store=%q provider=%q", store.idemHash, provider.idemKey)
	}
	second, e := service.Refund(t.Context(), "actor", input)
	if e != nil || !second.Replay || provider.calls != 1 {
		t.Fatalf("replay=%#v calls=%d err=%v", second, provider.calls, e)
	}
}
func TestRefundProviderFailureIsFailClosed(t *testing.T) {
	store := &fakeStore{}
	provider := &fakeProvider{err: errors.New("down")}
	service := NewService(store, provider, nil)
	_, e := service.Refund(t.Context(), "actor", RefundInput{OrderID: "00000000-0000-4000-8000-000000000099", Amount: "25.00", Reason: "Customer request", IdempotencyKey: "0123456789abcdef"})
	if !errors.Is(e, ErrUnavailable) || store.intent.Status != "provider_failed" {
		t.Fatalf("status=%s err=%v", store.intent.Status, e)
	}
}
