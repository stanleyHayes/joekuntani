package ticketops

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

const cancellationTemplate = `<!doctype html><html><body><h1>Your event has been cancelled</h1><p>Order {{.OrderReference}} is affected.</p><p>{{.Reason}}</p><p>Our team will contact you with refund updates. Refund timing depends on the payment provider and original payment method.</p></body></html>`

type ResendCommunicationSender struct {
	client   *http.Client
	endpoint string
	apiKey   string
	from     string
}

func NewResendCommunicationSender(client *http.Client, endpoint, apiKey, from string) (*ResendCommunicationSender, error) {
	u, err := url.Parse(endpoint)
	if client == nil || err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || len(apiKey) < 16 || !strings.Contains(from, "@") {
		return nil, ErrInvalid
	}
	return &ResendCommunicationSender{client: client, endpoint: endpoint, apiKey: apiKey, from: from}, nil
}

func (s *ResendCommunicationSender) SendCancellation(ctx context.Context, delivery Communication) error {
	var html bytes.Buffer
	if err := template.Must(template.New("cancellation").Parse(cancellationTemplate)).Execute(&html, delivery); err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]any{"from": s.from, "to": []string{delivery.BuyerEmail}, "subject": "Event cancellation and refund update", "html": html.String()})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+s.apiKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", delivery.ID)
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
