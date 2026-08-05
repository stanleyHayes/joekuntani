package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"
)

type memoryStore struct {
	order   Order
	saved   int
	events  map[string]bool
	applied []VerifiedEvent
}

func (m *memoryStore) CheckoutOrder(_ context.Context, ref, key string, now time.Time) (Order, error) {
	if ref != m.order.Reference || !secureEqual(key, m.order.IdempotencyHash) {
		return Order{}, ErrForbidden
	}
	if !m.order.HoldExpiresAt.After(now) {
		return Order{}, ErrConflict
	}
	return m.order, nil
}
func (m *memoryStore) SaveCheckout(_ context.Context, o Order, p string, s CheckoutSession, n time.Time) error {
	m.saved++
	m.order.CheckoutSession = &s
	return nil
}
func (m *memoryStore) ApplyWebhook(_ context.Context, p string, e VerifiedEvent, h string, n time.Time) (bool, error) {
	if m.events[e.ID] {
		return false, nil
	}
	m.events[e.ID] = true
	m.applied = append(m.applied, e)
	return true, nil
}
func TestProviderNeutralCheckoutAndSignedWebhook(t *testing.T) {
	now := time.Date(2026, 8, 5, 19, 0, 0, 0, time.UTC)
	key := "0123456789abcdef0123456789abcdef"
	d := sha256.Sum256([]byte(key))
	store := &memoryStore{order: Order{PublicID: "order-id", Reference: "JKT-2026-ABC12345", EventID: "event", Currency: "GHS", Total: "25.50", IdempotencyHash: hex.EncodeToString(d[:]), Status: "pending", HoldExpiresAt: now.Add(time.Minute)}, events: map[string]bool{}}
	provider := FakeProvider{Secret: []byte("0123456789abcdef0123456789abcdef"), BaseURL: "https://pay.example.test", Now: func() time.Time { return now }}
	service, err := NewService(store, provider, "https://example.test", nil)
	if err != nil {
		t.Fatal(err)
	}
	service.now = func() time.Time { return now }
	session, err := service.Checkout(t.Context(), store.order.Reference, key)
	if err != nil || session.URL != "https://pay.example.test/checkout/e3f2b5e82143dacd" || store.saved != 1 {
		t.Fatalf("session=%+v saved=%d err=%v", session, store.saved, err)
	}
	event := VerifiedEvent{ID: "evt-1", Type: "payment.succeeded", OrderReference: store.order.Reference, PaymentReference: "pay-1"}
	body, _ := json.Marshal(event)
	mac := hmac.New(sha256.New, provider.Secret)
	mac.Write(body)
	headers := http.Header{"X-Payment-Signature": []string{hex.EncodeToString(mac.Sum(nil))}}
	applied, err := service.Webhook(t.Context(), headers, body)
	if err != nil || !applied || len(store.applied) != 1 {
		t.Fatalf("applied=%v events=%d err=%v", applied, len(store.applied), err)
	}
	applied, err = service.Webhook(t.Context(), headers, body)
	if err != nil || applied {
		t.Fatalf("duplicate applied=%v err=%v", applied, err)
	}
}
func TestCheckoutAndWebhookFailClosed(t *testing.T) {
	provider := FakeProvider{Secret: []byte("0123456789abcdef0123456789abcdef"), BaseURL: "http://unsafe.test"}
	service, err := NewService(&memoryStore{}, provider, "http://example.test", nil)
	if !errors.Is(err, ErrInvalid) || service != nil {
		t.Fatal("unsafe return origin accepted")
	}
	store := &memoryStore{events: map[string]bool{}}
	service, _ = NewService(store, provider, "https://example.test", nil)
	if _, err = service.Webhook(t.Context(), http.Header{}, []byte(`{}`)); !errors.Is(err, ErrForbidden) {
		t.Fatalf("unsigned webhook err=%v", err)
	}
	if _, err = service.Checkout(t.Context(), "bad", "short"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid checkout err=%v", err)
	}
}
