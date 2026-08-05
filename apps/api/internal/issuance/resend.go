package issuance

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"strings"
)

const ticketEmailTemplate = `<!doctype html><html><body><h1>Your Joe Kuntani tickets are ready</h1><p>Payment for order {{.Reference}} is confirmed.</p><p><a href="{{.AccessURL}}">View and download your tickets</a></p><p>This private link expires. Do not forward it.</p></body></html>`

type ResendSender struct {
	client   *http.Client
	endpoint string
	apiKey   string
	from     string
}

func NewResendSender(client *http.Client, endpoint, apiKey, from string) (*ResendSender, error) {
	u, err := url.Parse(endpoint)
	if client == nil || err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || len(apiKey) < 16 || !strings.Contains(from, "@") {
		return nil, ErrInvalid
	}
	return &ResendSender{client: client, endpoint: endpoint, apiKey: apiKey, from: from}, nil
}
func (s *ResendSender) SendTickets(ctx context.Context, delivery Delivery) error {
	var html bytes.Buffer
	if err := template.Must(template.New("tickets").Parse(ticketEmailTemplate)).Execute(&html, delivery); err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]any{"from": s.from, "to": []string{delivery.BuyerEmail}, "subject": "Your Joe Kuntani tickets", "html": html.String()})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+s.apiKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", delivery.PublicID)
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
