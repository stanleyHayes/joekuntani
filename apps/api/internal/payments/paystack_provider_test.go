package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const testSecret = "sk_test_0123456789abcdefghijklmnop"

func newTestProvider(t *testing.T, handler http.HandlerFunc) (*PaystackProvider, *httptest.Server) {
	t.Helper()
	server := httptest.NewTLSServer(handler)
	t.Cleanup(server.Close)
	provider, err := NewPaystackProvider(testSecret, server.URL, server.Client())
	if err != nil {
		t.Fatalf("NewPaystackProvider: %v", err)
	}
	provider.Now = func() time.Time { return time.Date(2026, 8, 6, 12, 0, 0, 0, time.UTC) }
	return provider, server
}

func TestNewPaystackProviderRejectsBadConfig(t *testing.T) {
	for name, secret := range map[string]string{
		"empty":        "",
		"short":        "sk_test_1",
		"wrong prefix": "pk_test_0123456789abcdefghijklmnop",
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := NewPaystackProvider(secret, "", nil); !errors.Is(err, ErrInvalid) {
				t.Fatalf("expected ErrInvalid, got %v", err)
			}
		})
	}
	if _, err := NewPaystackProvider(testSecret, "http://api.paystack.co", nil); !errors.Is(err, ErrInvalid) {
		t.Fatalf("plaintext base URL must be rejected, got %v", err)
	}
}

func TestMinorUnits(t *testing.T) {
	ok := map[string]int64{"1": 100, "125.50": 12550, "0.05": 5, "12.5": 1250, "1000": 100000}
	for input, want := range ok {
		got, err := minorUnits(input)
		if err != nil || got != want {
			t.Fatalf("minorUnits(%q) = %d, %v; want %d", input, got, err, want)
		}
	}
	for _, input := range []string{"", "-5", "1.234", "abc", "0", "0.00", "1,5", "1e3", " 1 . 5"} {
		if _, err := minorUnits(input); err == nil {
			t.Fatalf("minorUnits(%q) should have failed", input)
		}
	}
}

func TestCreateCheckoutSendsMinorUnitsAndReturnsSession(t *testing.T) {
	var captured map[string]any
	provider, _ := newTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/transaction/initialize" || r.Method != http.MethodPost {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer "+testSecret {
			t.Errorf("Authorization = %q", got)
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &captured); err != nil {
			t.Errorf("decode body: %v", err)
		}
		_, _ = w.Write([]byte(`{"status":true,"message":"ok","data":{"authorization_url":"https://checkout.paystack.com/abc123","access_code":"abc123","reference":"JKT-2026-ABC12345"}}`))
	})

	session, err := provider.CreateCheckout(context.Background(), CheckoutRequest{
		IdempotencyKey: "order-uuid",
		OrderReference: "JKT-2026-ABC12345",
		Currency:       "ghs",
		Amount:         "125.50",
		ReturnURL:      "https://joekuntani.com/tickets/checkout",
		PayerEmail:     "buyer@example.com",
	})
	if err != nil {
		t.Fatalf("CreateCheckout: %v", err)
	}
	if session.URL != "https://checkout.paystack.com/abc123" {
		t.Errorf("URL = %q", session.URL)
	}
	if session.ID != "JKT-2026-ABC12345" {
		t.Errorf("ID = %q", session.ID)
	}
	if !session.ExpiresAt.After(provider.now()) {
		t.Errorf("session must expire in the future, got %v", session.ExpiresAt)
	}
	if amount, _ := captured["amount"].(float64); amount != 12550 {
		t.Errorf("amount = %v; want 12550 minor units", captured["amount"])
	}
	if captured["currency"] != "GHS" {
		t.Errorf("currency = %v; want GHS", captured["currency"])
	}
	if captured["email"] != "buyer@example.com" {
		t.Errorf("email = %v; want the buyer address", captured["email"])
	}
}

func TestCreateCheckoutRejectsMissingPayerEmail(t *testing.T) {
	provider, _ := newTestProvider(t, func(http.ResponseWriter, *http.Request) {
		t.Error("provider must not call Paystack without a payer email")
	})
	_, err := provider.CreateCheckout(context.Background(), CheckoutRequest{
		OrderReference: "JKT-2026-ABC12345", Currency: "GHS", Amount: "10",
	})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid, got %v", err)
	}
}

func TestCreateCheckoutRejectsPlaintextAuthorizationURL(t *testing.T) {
	provider, _ := newTestProvider(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status":true,"data":{"authorization_url":"http://checkout.paystack.com/abc","reference":"JKT-2026-ABC12345"}}`))
	})
	_, err := provider.CreateCheckout(context.Background(), CheckoutRequest{
		OrderReference: "JKT-2026-ABC12345", Currency: "GHS", Amount: "10", PayerEmail: "buyer@example.com",
	})
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("expected ErrUnavailable, got %v", err)
	}
}

func TestCreateCheckoutMapsUpstreamFailures(t *testing.T) {
	cases := map[int]error{
		http.StatusUnauthorized:        ErrForbidden,
		http.StatusBadRequest:          ErrInvalid,
		http.StatusInternalServerError: ErrUnavailable,
	}
	for status, want := range cases {
		provider, _ := newTestProvider(t, func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"status":false,"message":"nope"}`))
		})
		_, err := provider.CreateCheckout(context.Background(), CheckoutRequest{
			OrderReference: "JKT-2026-ABC12345", Currency: "GHS", Amount: "10", PayerEmail: "b@example.com",
		})
		if !errors.Is(err, want) {
			t.Errorf("status %d: got %v, want %v", status, err, want)
		}
	}
}

func signPaystack(body []byte) string {
	mac := hmac.New(sha512.New, []byte(testSecret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func TestVerifyWebhookAcceptsValidSignature(t *testing.T) {
	provider, _ := newTestProvider(t, func(http.ResponseWriter, *http.Request) {})
	body := []byte(`{"event":"charge.success","data":{"id":123456,"reference":"JKT-2026-ABC12345","status":"success"}}`)
	headers := http.Header{"X-Paystack-Signature": []string{signPaystack(body)}}

	event, err := provider.VerifyWebhook(headers, body)
	if err != nil {
		t.Fatalf("VerifyWebhook: %v", err)
	}
	if event.Type != "payment.succeeded" {
		t.Errorf("Type = %q; want payment.succeeded", event.Type)
	}
	if event.OrderReference != "JKT-2026-ABC12345" {
		t.Errorf("OrderReference = %q", event.OrderReference)
	}
	if event.ID == "" {
		t.Error("event ID must be set so retries dedupe")
	}
}

func TestVerifyWebhookIsDeterministicForRetries(t *testing.T) {
	provider, _ := newTestProvider(t, func(http.ResponseWriter, *http.Request) {})
	body := []byte(`{"event":"charge.success","data":{"id":123456,"reference":"JKT-2026-ABC12345"}}`)
	headers := http.Header{"X-Paystack-Signature": []string{signPaystack(body)}}

	first, err := provider.VerifyWebhook(headers, body)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	second, err := provider.VerifyWebhook(headers, body)
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if first.ID != second.ID {
		t.Errorf("retry produced a different id: %q vs %q", first.ID, second.ID)
	}
}

func TestVerifyWebhookRejectsBadSignature(t *testing.T) {
	provider, _ := newTestProvider(t, func(http.ResponseWriter, *http.Request) {})
	body := []byte(`{"event":"charge.success","data":{"id":1,"reference":"JKT-2026-ABC12345"}}`)

	for name, headers := range map[string]http.Header{
		"missing": {},
		"wrong":   {"X-Paystack-Signature": []string{strings.Repeat("a", 128)}},
		"sha256":  {"X-Paystack-Signature": []string{"deadbeef"}},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := provider.VerifyWebhook(headers, body); !errors.Is(err, ErrForbidden) {
				t.Fatalf("expected ErrForbidden, got %v", err)
			}
		})
	}
}

func TestVerifyWebhookRejectsTamperedBody(t *testing.T) {
	provider, _ := newTestProvider(t, func(http.ResponseWriter, *http.Request) {})
	original := []byte(`{"event":"charge.success","data":{"id":1,"reference":"JKT-2026-ABC12345"}}`)
	headers := http.Header{"X-Paystack-Signature": []string{signPaystack(original)}}
	tampered := []byte(`{"event":"charge.success","data":{"id":1,"reference":"JKT-2026-ZZZZZZZZ"}}`)

	if _, err := provider.VerifyWebhook(headers, tampered); !errors.Is(err, ErrForbidden) {
		t.Fatalf("tampered body must be rejected, got %v", err)
	}
}

func TestVerifyWebhookMapsRefundAndFailureEvents(t *testing.T) {
	provider, _ := newTestProvider(t, func(http.ResponseWriter, *http.Request) {})
	cases := map[string]string{
		`{"event":"charge.failed","data":{"id":2,"reference":"JKT-2026-ABC12345","gateway_response":"declined"}}`:                               "payment.failed",
		`{"event":"refund.processed","data":{"id":3,"reference":"RF1","transaction":{"reference":"JKT-2026-ABC12345"}}}`:                        "refund.succeeded",
		`{"event":"refund.failed","data":{"id":4,"reference":"RF2","message":"bank rejected","transaction":{"reference":"JKT-2026-ABC12345"}}}`: "refund.failed",
	}
	for raw, wantType := range cases {
		body := []byte(raw)
		headers := http.Header{"X-Paystack-Signature": []string{signPaystack(body)}}
		event, err := provider.VerifyWebhook(headers, body)
		if err != nil {
			t.Fatalf("VerifyWebhook(%s): %v", raw, err)
		}
		if event.Type != wantType {
			t.Errorf("Type = %q; want %q", event.Type, wantType)
		}
		if event.OrderReference != "JKT-2026-ABC12345" {
			t.Errorf("OrderReference = %q; refunds must resolve to the order", event.OrderReference)
		}
	}
}

func TestGetPaymentStatusNormalizes(t *testing.T) {
	for upstream, want := range map[string]string{
		"success":   "succeeded",
		"failed":    "failed",
		"abandoned": "abandoned",
	} {
		provider, _ := newTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasPrefix(r.URL.Path, "/transaction/verify/") {
				t.Errorf("unexpected path %s", r.URL.Path)
			}
			_, _ = w.Write([]byte(`{"status":true,"data":{"reference":"JKT-2026-ABC12345","status":"` + upstream + `"}}`))
		})
		status, err := provider.GetPaymentStatus(context.Background(), "JKT-2026-ABC12345")
		if err != nil {
			t.Fatalf("GetPaymentStatus: %v", err)
		}
		if status.Status != want {
			t.Errorf("status %q normalized to %q; want %q", upstream, status.Status, want)
		}
	}
}

func TestRefundSendsMinorUnits(t *testing.T) {
	var captured map[string]any
	provider, _ := newTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/refund" || r.Method != http.MethodPost {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &captured)
		_, _ = w.Write([]byte(`{"status":true,"data":{"status":"processed","reference":"RF-1","transaction":{"reference":"JKT-2026-ABC12345"}}}`))
	})

	result, err := provider.Refund(context.Background(), RefundRequest{
		PaymentReference: "JKT-2026-ABC12345",
		Amount:           "25.00",
		Currency:         "GHS",
		Reason:           "duplicate order",
	})
	if err != nil {
		t.Fatalf("Refund: %v", err)
	}
	if result.Status != "succeeded" {
		t.Errorf("Status = %q; want succeeded", result.Status)
	}
	if amount, _ := captured["amount"].(float64); amount != 2500 {
		t.Errorf("amount = %v; want 2500 minor units", captured["amount"])
	}
	if captured["transaction"] != "JKT-2026-ABC12345" {
		t.Errorf("transaction = %v", captured["transaction"])
	}
	if captured["merchant_note"] != "duplicate order" {
		t.Errorf("merchant_note = %v", captured["merchant_note"])
	}
}

func TestRefundOmitsAmountForFullRefund(t *testing.T) {
	var captured map[string]any
	provider, _ := newTestProvider(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &captured)
		_, _ = w.Write([]byte(`{"status":true,"data":{"status":"pending","reference":"RF-2"}}`))
	})
	if _, err := provider.Refund(context.Background(), RefundRequest{PaymentReference: "JKT-2026-ABC12345"}); err != nil {
		t.Fatalf("Refund: %v", err)
	}
	if _, present := captured["amount"]; present {
		t.Error("a full refund must not send an amount")
	}
}
