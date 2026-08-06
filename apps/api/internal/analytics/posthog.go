package analytics

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type PostHogSink struct {
	Endpoint string
	APIKey   string
	Client   *http.Client
}

func NewPostHogSink(endpoint, apiKey string) *PostHogSink {
	endpoint = strings.TrimRight(strings.TrimSpace(endpoint), "/")
	if endpoint == "" {
		endpoint = "https://us.i.posthog.com"
	}
	return &PostHogSink{
		Endpoint: endpoint,
		APIKey:   strings.TrimSpace(apiKey),
		Client:   &http.Client{Timeout: 3 * time.Second},
	}
}

func (sink *PostHogSink) Emit(ctx context.Context, event ConversionEvent) error {
	if sink == nil || sink.APIKey == "" || event.Internal {
		return nil
	}
	payload := map[string]any{
		"api_key":     sink.APIKey,
		"event":       string(event.Name),
		"distinct_id": "anonymous",
		"properties": map[string]any{
			"$process_person_profile": false,
			"conversion_id":           event.PublicID,
			"occurred_at":             event.OccurredAt.UTC().Format(time.RFC3339),
		},
		"timestamp": event.OccurredAt.UTC().Format(time.RFC3339),
	}
	properties := payload["properties"].(map[string]any)
	for key, value := range event.Properties {
		properties[key] = value
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, sink.Endpoint+"/capture/", bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := sink.Client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode >= 300 {
		return ErrUnavailable
	}
	return nil
}
