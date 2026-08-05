package issuance

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestResendSenderUsesServerSecretTemplateAndIdempotency(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Header.Get("Authorization") != "Bearer server-secret-0123456789" || request.Header.Get("Idempotency-Key") != "delivery-id" {
			t.Fatalf("unsafe resend headers: %#v", request.Header)
		}
		body, _ := io.ReadAll(request.Body)
		if !strings.Contains(string(body), "https://example.test/tickets/JKT-2026-ABC12345?access=secret") || !strings.Contains(string(body), "Your Joe Kuntani tickets are ready") {
			t.Fatalf("template body=%s", body)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"id":"email"}`))}, nil
	})}
	sender, err := NewResendSender(client, "https://api.resend.com/emails", "server-secret-0123456789", "tickets@example.test")
	if err != nil {
		t.Fatal(err)
	}
	if err = sender.SendTickets(context.Background(), Delivery{PublicID: "delivery-id", Reference: "JKT-2026-ABC12345", BuyerEmail: "buyer@example.test", AccessURL: "https://example.test/tickets/JKT-2026-ABC12345?access=secret"}); err != nil {
		t.Fatal(err)
	}
}
