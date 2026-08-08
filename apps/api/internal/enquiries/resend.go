package enquiries

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// UnavailableSender stands in when no mail provider is configured. It fails
// rather than succeeding quietly, so the outbox keeps the message pending and
// a later deploy with credentials still delivers it. Reporting success here
// would mark unsent mail as sent and lose the enquiry for good.
type UnavailableSender struct{}

func (UnavailableSender) Send(context.Context, OutboxMessage) error { return ErrUnavailable }

// ResendSender delivers the two enquiry notifications through Resend: an
// acknowledgement to the person who enquired and an alert to the internal
// inbox. It reads the enquiry itself rather than trusting the outbox row,
// which carries only an identifier and a kind.
type ResendSender struct {
	db                   *mongo.Database
	client               *http.Client
	endpoint, key, from  string
	internalTo, adminURL string
	brand                string
}

// NewResendSender validates every leg of the delivery path up front so a
// misconfigured deployment fails at boot instead of dead-lettering enquiries
// eight attempts later.
func NewResendSender(db *mongo.Database, client *http.Client, endpoint, key, from, internalTo, adminURL string) (*ResendSender, error) {
	api, err := url.Parse(endpoint)
	admin, adminErr := url.Parse(strings.TrimSpace(adminURL))
	internalTo = strings.TrimSpace(internalTo)
	if db == nil || client == nil || err != nil || adminErr != nil || api.Scheme != "https" || api.Host == "" {
		return nil, ErrUnavailable
	}
	if !adminOriginUsable(admin) || len(key) < 16 || !strings.Contains(from, "@") || !strings.Contains(internalTo, "@") {
		return nil, ErrUnavailable
	}
	return &ResendSender{db: db, client: client, endpoint: endpoint, key: key, from: from, internalTo: internalTo, adminURL: strings.TrimRight(admin.String(), "/"), brand: "Joe Kuntani"}, nil
}

// adminOriginUsable mirrors crmworkflow: TLS wherever a link can leave the
// machine, plain http tolerated only on loopback so a local API still sends.
func adminOriginUsable(admin *url.URL) bool {
	if admin.Host == "" {
		return false
	}
	if admin.Scheme == "https" {
		return true
	}
	if admin.Scheme != "http" {
		return false
	}
	switch admin.Hostname() {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}

type notificationEnquiry struct {
	PublicID     string `bson:"public_id"`
	Reference    string `bson:"reference"`
	EnquiryType  string `bson:"enquiry_type"`
	Source       string `bson:"source"`
	Budget       string `bson:"budget"`
	Timeline     string `bson:"timeline"`
	Currency     string `bson:"currency"`
	ProjectBrief string `bson:"project_brief"`
	Contact      struct {
		Name         string `bson:"name"`
		Email        string `bson:"email"`
		Phone        string `bson:"phone"`
		Organization string `bson:"organization"`
	} `bson:"contact"`
}

func (s *ResendSender) Send(ctx context.Context, message OutboxMessage) error {
	var enquiry notificationEnquiry
	if err := s.db.Collection("enquiries").FindOne(ctx, bson.M{"public_id": message.EnquiryID}).Decode(&enquiry); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrInvalid
		}
		return err
	}
	to, subject, body, err := s.compose(message.Kind, enquiry)
	if err != nil {
		return err
	}
	return s.post(ctx, message.PublicID, to, subject, body)
}

func (s *ResendSender) compose(kind string, enquiry notificationEnquiry) (to, subject, body string, err error) {
	switch kind {
	case "enquiry.acknowledgement":
		if !strings.Contains(enquiry.Contact.Email, "@") {
			return "", "", "", ErrInvalid
		}
		subject = fmt.Sprintf("%s: we have your enquiry (%s)", s.brand, enquiry.Reference)
		body = fmt.Sprintf(
			"<p>Hello %s,</p><p>Thank you for your enquiry. It is with the booking team and your reference is <strong>%s</strong> — quote it in any reply.</p><p>We answer enquiries in the order they arrive. There is nothing further for you to do.</p><p>— %s</p>",
			html.EscapeString(enquiry.Contact.Name), html.EscapeString(enquiry.Reference), html.EscapeString(s.brand))
		return enquiry.Contact.Email, subject, body, nil
	case "enquiry.internal_alert":
		subject = fmt.Sprintf("New %s enquiry — %s", enquiryTypeLabel(enquiry.EnquiryType), enquiry.Reference)
		// The console list, not a deep link. This alert fires from the enquiry
		// outbox, which knows only the public enquiry id; the CRM record is
		// created on a separate tick and is keyed by its own id, so no link
		// built here could open the lead. The reference is in the body above,
		// and the list is searchable by it.
		link := s.adminURL + "/crm"
		body = fmt.Sprintf(
			"<p><strong>%s</strong> — %s enquiry via %s.</p><ul><li>Contact: %s%s</li><li>Budget: %s %s</li><li>Timeline: %s</li></ul><p>%s</p><p><a href=\"%s\">Open the CRM</a> and search for %s.</p>",
			html.EscapeString(enquiry.Reference), html.EscapeString(enquiryTypeLabel(enquiry.EnquiryType)), html.EscapeString(orDash(enquiry.Source)),
			html.EscapeString(enquiry.Contact.Name), organizationSuffix(enquiry.Contact.Organization),
			html.EscapeString(orDash(enquiry.Currency)), html.EscapeString(orDash(enquiry.Budget)), html.EscapeString(orDash(enquiry.Timeline)),
			html.EscapeString(truncate(enquiry.ProjectBrief, 600)), link, html.EscapeString(enquiry.Reference))
		return s.internalTo, subject, body, nil
	}
	// An unknown kind is a bug, not a transient fault. Returning ErrInvalid
	// lets the worker retry it into the dead-letter state rather than looping
	// on a message no version of this code can deliver.
	return "", "", "", ErrInvalid
}

func (s *ResendSender) post(ctx context.Context, messageID, to, subject, body string) error {
	payload, err := json.Marshal(map[string]any{"from": s.from, "to": []string{to}, "subject": subject, "html": body})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+s.key)
	// Resend deduplicates on this, so a retry after an ambiguous timeout does
	// not mail the enquirer twice.
	request.Header.Set("Idempotency-Key", messageID)
	request.Header.Set("Content-Type", "application/json")
	response, err := s.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("resend status %d", response.StatusCode)
	}
	return nil
}

func enquiryTypeLabel(kind string) string {
	if kind == "brand" {
		return "brand"
	}
	return "event"
}
func orDash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "—"
	}
	return value
}
func organizationSuffix(organization string) string {
	if strings.TrimSpace(organization) == "" {
		return ""
	}
	return " (" + html.EscapeString(organization) + ")"
}

// truncate cuts on a character boundary. Slicing at a byte offset could split a
// multi-byte character in half and emit invalid UTF-8 into the alert email.
func truncate(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) <= limit {
		return value
	}
	var trimmed strings.Builder
	for _, character := range value {
		if trimmed.Len()+utf8.RuneLen(character) > limit {
			break
		}
		trimmed.WriteRune(character)
	}
	return trimmed.String() + "…"
}
