package crmworkflow

import (
	"context"
	"log/slog"
)

type SlogTelemetry struct{ Logger *slog.Logger }

func (t SlogTelemetry) Count(ctx context.Context, event string, dimensions map[string]string) {
	if t.Logger != nil {
		t.Logger.InfoContext(ctx, "crm workflow event", "event", event, "dimensions", dimensions)
	}
}
