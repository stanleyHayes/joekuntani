package observability_test

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/observability"
)

func TestJSONHandlerRedactsSecretsAndPII(t *testing.T) {
	t.Parallel()
	var output bytes.Buffer
	logger := slog.New(observability.NewJSONHandler(&output, nil))
	logger.Info("test", "request_id", "safe", "authorization", "Bearer private", "customer_email", "person@example.com", "status", 200)
	line := output.String()
	if strings.Contains(line, "private") || strings.Contains(line, "person@example.com") {
		t.Fatalf("sensitive data leaked: %s", line)
	}
	if !strings.Contains(line, `"request_id":"safe"`) || !strings.Contains(line, `"status":200`) {
		t.Fatalf("safe fields missing: %s", line)
	}
}

func TestJSONHandlerRedactsCompositeUnknownValues(t *testing.T) {
	t.Parallel()
	var output bytes.Buffer
	logger := slog.New(observability.NewJSONHandler(&output, nil))
	logger.Info("test", "payload", map[string]any{"nested": map[string]string{"password": "private"}})
	line := output.String()
	if strings.Contains(line, "private") || strings.Contains(line, "password") || !strings.Contains(line, `"payload":"[REDACTED]"`) {
		t.Fatalf("composite data leaked: %s", line)
	}
}
