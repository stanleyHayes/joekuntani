package enquiries

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func testSender(t *testing.T, endpoint string) *ResendSender {
	t.Helper()
	// db is only read by Send; compose and post never touch it.
	return &ResendSender{
		client: endpoint2Client(), endpoint: endpoint,
		key: "resend_key_0123456789", from: "bookings@joekuntani.com",
		internalTo: "inbox@joekuntani.com", adminURL: "https://joekuntani.com", brand: "Joe Kuntani",
	}
}

func endpoint2Client() *http.Client { return &http.Client{} }

func sampleEnquiry() notificationEnquiry {
	var enquiry notificationEnquiry
	enquiry.PublicID = "00000000-0000-4000-8000-0000000000a1"
	enquiry.Reference = "JK-2026-ABC123"
	enquiry.EnquiryType = "event"
	enquiry.Source = "referral"
	enquiry.Budget = "20000"
	enquiry.Timeline = "Q4 2026"
	enquiry.Currency = "GHS"
	enquiry.ProjectBrief = "Launch night, two sets."
	enquiry.Contact.Name = "Ama Boateng"
	enquiry.Contact.Email = "ama@example.com"
	enquiry.Contact.Organization = "Kori Studios"
	return enquiry
}

func TestComposeAcknowledgementGoesToTheEnquirer(t *testing.T) {
	sender := testSender(t, "https://api.resend.com/emails")
	to, subject, body, err := sender.compose("enquiry.acknowledgement", sampleEnquiry())
	if err != nil {
		t.Fatalf("compose = %v", err)
	}
	if to != "ama@example.com" {
		t.Fatalf("to = %q", to)
	}
	if !strings.Contains(subject, "JK-2026-ABC123") || !strings.Contains(body, "JK-2026-ABC123") {
		t.Fatalf("reference missing: %q / %q", subject, body)
	}
	// The acknowledgement must never leak the internal console.
	if strings.Contains(body, "/admin/") {
		t.Fatalf("acknowledgement links into admin: %q", body)
	}
}

func TestComposeInternalAlertGoesToTheInbox(t *testing.T) {
	sender := testSender(t, "https://api.resend.com/emails")
	to, subject, body, err := sender.compose("enquiry.internal_alert", sampleEnquiry())
	if err != nil {
		t.Fatalf("compose = %v", err)
	}
	if to != "inbox@joekuntani.com" {
		t.Fatalf("to = %q", to)
	}
	if !strings.Contains(subject, "JK-2026-ABC123") {
		t.Fatalf("subject = %q", subject)
	}
	// The list, not a deep link: this alert only knows the public enquiry id,
	// while the CRM record is created on a separate tick under its own id. The
	// reference is what makes the lead findable.
	if !strings.Contains(body, `href="https://joekuntani.com/admin/crm"`) {
		t.Fatalf("console link missing: %q", body)
	}
	if strings.Contains(body, "?enquiry=") {
		t.Fatalf("alert still carries a link no screen can resolve: %q", body)
	}
	for _, want := range []string{"Ama Boateng", "Kori Studios", "GHS", "Q4 2026", "Launch night"} {
		if !strings.Contains(body, want) {
			t.Fatalf("%q missing from alert: %q", want, body)
		}
	}
}

// Contact fields are attacker-controlled free text landing in an HTML body.
func TestComposeEscapesContactSuppliedHTML(t *testing.T) {
	sender := testSender(t, "https://api.resend.com/emails")
	enquiry := sampleEnquiry()
	enquiry.Contact.Name = `<script>alert(1)</script>`
	enquiry.Contact.Organization = `<img src=x onerror=alert(2)>`
	for _, kind := range []string{"enquiry.acknowledgement", "enquiry.internal_alert"} {
		_, _, body, err := sender.compose(kind, enquiry)
		if err != nil {
			t.Fatalf("%s compose = %v", kind, err)
		}
		// The payloads must survive only as inert text, so no raw tag opening
		// from contact input may appear.
		for _, raw := range []string{"<script", "<img", "</script>"} {
			if strings.Contains(body, raw) {
				t.Fatalf("%s left %q unescaped: %q", kind, raw, body)
			}
		}
		if !strings.Contains(body, "&lt;script&gt;") {
			t.Fatalf("%s did not render the payload as escaped text: %q", kind, body)
		}
	}
}

// A kind this build cannot render is a bug. It must dead-letter rather than
// retry forever against a message no code path can deliver.
func TestComposeRejectsUnknownKind(t *testing.T) {
	sender := testSender(t, "https://api.resend.com/emails")
	if _, _, _, err := sender.compose("enquiry.telepathy", sampleEnquiry()); !errors.Is(err, ErrInvalid) {
		t.Fatalf("compose = %v, want ErrInvalid", err)
	}
}

func TestComposeRejectsAcknowledgementWithoutAddress(t *testing.T) {
	sender := testSender(t, "https://api.resend.com/emails")
	enquiry := sampleEnquiry()
	enquiry.Contact.Email = ""
	if _, _, _, err := sender.compose("enquiry.acknowledgement", enquiry); !errors.Is(err, ErrInvalid) {
		t.Fatalf("compose = %v, want ErrInvalid", err)
	}
}

func TestPostSendsAuthorizedIdempotentRequest(t *testing.T) {
	var got struct {
		auth, idempotency string
		payload           map[string]any
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.auth = r.Header.Get("Authorization")
		got.idempotency = r.Header.Get("Idempotency-Key")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &got.payload)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sender := testSender(t, server.URL)
	if err := sender.post(context.Background(), "msg-1", "ama@example.com", "Subject", "<p>Body</p>"); err != nil {
		t.Fatalf("post = %v", err)
	}
	if got.auth != "Bearer resend_key_0123456789" {
		t.Fatalf("authorization = %q", got.auth)
	}
	// Without this a retry after an ambiguous timeout mails the enquirer twice.
	if got.idempotency != "msg-1" {
		t.Fatalf("idempotency key = %q", got.idempotency)
	}
	if got.payload["from"] != "bookings@joekuntani.com" || got.payload["subject"] != "Subject" {
		t.Fatalf("payload = %#v", got.payload)
	}
}

func TestPostReportsProviderFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()

	sender := testSender(t, server.URL)
	err := sender.post(context.Background(), "msg-1", "ama@example.com", "Subject", "<p>Body</p>")
	if err == nil || !strings.Contains(err.Error(), "429") {
		t.Fatalf("post = %v, want the provider status surfaced", err)
	}
}

// Reporting success with no provider would mark unsent mail as sent and lose
// the enquiry permanently.
func TestUnavailableSenderRefusesRatherThanSwallowing(t *testing.T) {
	if err := (UnavailableSender{}).Send(context.Background(), OutboxMessage{}); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("Send = %v, want ErrUnavailable", err)
	}
}

// unconnectedDatabase yields a usable handle without dialling, so the
// constructor's other guards are what these cases actually exercise.
func unconnectedDatabase(t *testing.T) *mongo.Database {
	t.Helper()
	client, err := mongo.Connect(options.Client().ApplyURI("mongodb://127.0.0.1:27017/?connect=direct"))
	if err != nil {
		t.Fatalf("client: %v", err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	return client.Database("enquiries_test")
}

func mustParse(t *testing.T, raw string) *url.URL {
	t.Helper()
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse %q: %v", raw, err)
	}
	return parsed
}

func TestNewResendSenderRejectsUnusableConfiguration(t *testing.T) {
	db, client := unconnectedDatabase(t), &http.Client{}
	cases := []struct {
		name                                      string
		endpoint, key, from, internalTo, adminURL string
	}{
		{"plaintext provider", "http://api.resend.com/emails", "resend_key_0123456789", "a@b.com", "c@d.com", "https://joekuntani.com"},
		{"short key", "https://api.resend.com/emails", "short", "a@b.com", "c@d.com", "https://joekuntani.com"},
		{"sender is not an address", "https://api.resend.com/emails", "resend_key_0123456789", "nobody", "c@d.com", "https://joekuntani.com"},
		{"inbox is not an address", "https://api.resend.com/emails", "resend_key_0123456789", "a@b.com", "nobody", "https://joekuntani.com"},
		{"remote admin origin over plaintext", "https://api.resend.com/emails", "resend_key_0123456789", "a@b.com", "c@d.com", "http://joekuntani.com"},
		{"admin origin missing", "https://api.resend.com/emails", "resend_key_0123456789", "a@b.com", "c@d.com", ""},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if _, err := NewResendSender(db, client, testCase.endpoint, testCase.key, testCase.from, testCase.internalTo, testCase.adminURL); err == nil {
				t.Fatal("configuration accepted")
			}
		})
	}
}

// Loopback over plaintext stays usable so a local API still sends mail.
func TestNewResendSenderAcceptsLoopbackAdminOrigin(t *testing.T) {
	for _, origin := range []string{"http://localhost:3000", "http://127.0.0.1:3000", "https://joekuntani.com"} {
		parsed := mustParse(t, origin)
		if !adminOriginUsable(parsed) {
			t.Fatalf("%s rejected", origin)
		}
	}
	for _, origin := range []string{"http://joekuntani.com", "ftp://joekuntani.com", "https://"} {
		if adminOriginUsable(mustParse(t, origin)) {
			t.Fatalf("%s accepted", origin)
		}
	}
}

func TestTruncateKeepsAlertsBounded(t *testing.T) {
	if got := truncate("  short  ", 100); got != "short" {
		t.Fatalf("truncate = %q", got)
	}
	if got := truncate(strings.Repeat("x", 700), 600); len(got) != 600+len("…") {
		t.Fatalf("truncate length = %d", len(got))
	}
}
