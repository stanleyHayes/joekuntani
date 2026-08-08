package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"strings"
)

// ResendInvitationMailer delivers staff invitations through Resend.
//
// It carries no database handle on purpose: the caller has already resolved the
// recipient, and a mailer that cannot read the user collection cannot leak it.
type ResendInvitationMailer struct {
	client              *http.Client
	endpoint, key, from string
	subjectPrefix       string
}

func NewResendInvitationMailer(client *http.Client, endpoint, key, from string) (*ResendInvitationMailer, error) {
	api, err := url.Parse(endpoint)
	if err != nil || api.Scheme != "https" || api.Host == "" {
		return nil, ErrInvalidCredentials
	}
	if client == nil || len(key) < 16 || !strings.Contains(from, "@") {
		return nil, ErrInvalidCredentials
	}
	return &ResendInvitationMailer{client: client, endpoint: endpoint, key: key, from: from, subjectPrefix: "Joe Kuntani admin"}, nil
}

func (mailer *ResendInvitationMailer) SendStaffInvitation(ctx context.Context, email, name, acceptURL string) error {
	// Escaped rather than interpolated: the name is operator-supplied and lands
	// in an HTML body.
	safeName := html.EscapeString(strings.TrimSpace(name))
	safeURL := html.EscapeString(acceptURL)
	body := fmt.Sprintf(
		"<p>Hello %s,</p><p>You have been invited to the %s console. Set your password to activate the account:</p><p><a href=\"%s\">Set your password</a></p><p>The link expires 15 minutes after it was issued and can only be used once, so open it now — an administrator can send a fresh one if it lapses. If you were not expecting this, ignore this message: no account is usable until the link is opened.</p>",
		safeName, mailer.subjectPrefix, safeURL)
	payload, err := json.Marshal(map[string]any{
		"from":    mailer.from,
		"to":      []string{email},
		"subject": mailer.subjectPrefix + ": set your password",
		"html":    body,
	})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, mailer.endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+mailer.key)
	request.Header.Set("Content-Type", "application/json")
	response, err := mailer.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("resend status %d", response.StatusCode)
	}
	return nil
}
