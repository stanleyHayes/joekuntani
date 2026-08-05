package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"
)

type FakeProvider struct {
	Secret  []byte
	BaseURL string
	Now     func() time.Time
}

func (f FakeProvider) Name() string { return "fake" }
func (f FakeProvider) CreateCheckout(_ context.Context, r CheckoutRequest) (CheckoutSession, error) {
	if len(f.Secret) < 32 {
		return CheckoutSession{}, ErrUnavailable
	}
	now := time.Now()
	if f.Now != nil {
		now = f.Now()
	}
	sum := sha256.Sum256([]byte(r.IdempotencyKey))
	return CheckoutSession{ID: hex.EncodeToString(sum[:8]), URL: f.BaseURL + "/checkout/" + hex.EncodeToString(sum[:8]), ExpiresAt: now.Add(10 * time.Minute)}, nil
}
func (f FakeProvider) VerifyWebhook(h http.Header, b []byte) (VerifiedEvent, error) {
	mac := hmac.New(sha256.New, f.Secret)
	mac.Write(b)
	want := hex.EncodeToString(mac.Sum(nil))
	if !secureEqual(want, h.Get("X-Payment-Signature")) {
		return VerifiedEvent{}, ErrForbidden
	}
	var e VerifiedEvent
	if json.Unmarshal(b, &e) != nil {
		return e, ErrInvalid
	}
	return e, nil
}
func (f FakeProvider) GetPaymentStatus(context.Context, string) (PaymentStatus, error) {
	return PaymentStatus{Status: "pending"}, nil
}
func (f FakeProvider) Refund(context.Context, RefundRequest) (RefundResult, error) {
	return RefundResult{Status: "pending"}, nil
}
