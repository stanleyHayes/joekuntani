package observability

import (
	"context"
	"log/slog"
	"strings"
)

const redacted = "[REDACTED]"

var sensitiveKeys = []string{
	"authorization", "cookie", "password", "secret", "token", "email", "phone",
	"address", "body", "notes", "card", "account", "session", "credential",
}

// Only operational metadata is allowed through. Unknown attributes are redacted
// even when their key does not look sensitive, preventing composite values from
// bypassing field-name heuristics.
var safeKeys = map[string]struct{}{
	"duration_ms": {}, "environment": {}, "listen_address": {}, "method": {}, "route": {},
	"release": {}, "request_id": {}, "status": {},
}

// NewJSONHandler returns a structured handler that redacts secrets and common PII.
func NewJSONHandler(output interface{ Write([]byte) (int, error) }, options *slog.HandlerOptions) slog.Handler {
	return &redactingHandler{next: slog.NewJSONHandler(output, options)}
}

type redactingHandler struct{ next slog.Handler }

func (handler *redactingHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return handler.next.Enabled(ctx, level)
}

func (handler *redactingHandler) Handle(ctx context.Context, record slog.Record) error {
	clean := slog.NewRecord(record.Time, record.Level, record.Message, record.PC)
	record.Attrs(func(attribute slog.Attr) bool {
		clean.AddAttrs(redactAttr(attribute))
		return true
	})
	return handler.next.Handle(ctx, clean)
}

func (handler *redactingHandler) WithAttrs(attributes []slog.Attr) slog.Handler {
	clean := make([]slog.Attr, 0, len(attributes))
	for _, attribute := range attributes {
		clean = append(clean, redactAttr(attribute))
	}
	return &redactingHandler{next: handler.next.WithAttrs(clean)}
}

func (handler *redactingHandler) WithGroup(name string) slog.Handler {
	return &redactingHandler{next: handler.next.WithGroup(name)}
}

func redactAttr(attribute slog.Attr) slog.Attr {
	attribute.Value = attribute.Value.Resolve()
	if isSensitive(attribute.Key) || !isSafe(attribute.Key) {
		return slog.String(attribute.Key, redacted)
	}
	return attribute
}

func isSafe(key string) bool {
	_, ok := safeKeys[strings.ToLower(strings.ReplaceAll(key, "-", "_"))]
	return ok
}

func isSensitive(key string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(key, "-", "_"))
	for _, sensitive := range sensitiveKeys {
		if strings.Contains(normalized, sensitive) {
			return true
		}
	}
	return false
}
