package crmworkflow

import (
	"net/http"
	"testing"

	"go.mongodb.org/mongo-driver/v2/mongo"
)

// The admin URL ends up as a link in staff notification email, so it must be
// TLS anywhere it could leave the machine. Loopback is the one exception, so a
// local API can send notifications instead of refusing to boot.
func TestNewResendSenderAdminOriginRules(t *testing.T) {
	const (
		endpoint = "https://api.resend.com/emails"
		key      = "re_0123456789abcdef"
		from     = "bookings@example.test"
	)
	db, client := &mongo.Database{}, &http.Client{}

	for _, tc := range []struct {
		name     string
		adminURL string
		want     bool
	}{
		{"https public host", "https://joekuntani.com", true},
		{"http localhost", "http://localhost:3000", true},
		{"http loopback ip", "http://127.0.0.1:3000", true},
		{"http ipv6 loopback", "http://[::1]:3000", true},
		{"http public host is rejected", "http://joekuntani.com", false},
		{"non-loopback lookalike is rejected", "http://localhost.evil.test", false},
		{"unsupported scheme is rejected", "ftp://joekuntani.com", false},
		{"empty is rejected", "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sender, err := NewResendSender(db, client, endpoint, key, from, tc.adminURL)
			if got := err == nil; got != tc.want {
				t.Fatalf("adminURL %q accepted=%v, want %v (err=%v)", tc.adminURL, got, tc.want, err)
			}
			if tc.want && sender == nil {
				t.Fatal("expected a sender when the admin URL is accepted")
			}
		})
	}
}

// The Resend call always crosses the network, so its endpoint stays https-only
// regardless of the loopback allowance above.
func TestNewResendSenderRejectsInsecureEndpointAndBadCredentials(t *testing.T) {
	db, client := &mongo.Database{}, &http.Client{}
	const admin = "http://localhost:3000"

	for _, tc := range []struct {
		name                string
		endpoint, key, from string
	}{
		{"plain http endpoint", "http://api.resend.com/emails", "re_0123456789abcdef", "a@b.test"},
		{"loopback endpoint", "http://localhost/emails", "re_0123456789abcdef", "a@b.test"},
		{"short key", "https://api.resend.com/emails", "short", "a@b.test"},
		{"sender without an address", "https://api.resend.com/emails", "re_0123456789abcdef", "not-an-email"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := NewResendSender(db, client, tc.endpoint, tc.key, tc.from, admin); err == nil {
				t.Fatal("expected the configuration to be rejected")
			}
		})
	}
}
