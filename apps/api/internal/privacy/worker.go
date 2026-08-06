package privacy

import (
	"context"
	"errors"
	"time"
)

// RetentionWorker periodically purges enquiry personal data past the default retention window.
type RetentionWorker struct {
	service *Service
	actor   Actor
}

func NewRetentionWorker(service *Service, actor Actor) *RetentionWorker {
	return &RetentionWorker{service: service, actor: actor}
}

func (worker *RetentionWorker) RunOnce(ctx context.Context, limit int) (RetentionResult, error) {
	return worker.service.RunRetention(ctx, worker.actor, limit)
}

func (worker *RetentionWorker) Run(ctx context.Context, interval time.Duration, limit int) error {
	if interval <= 0 {
		interval = time.Hour
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if _, err := worker.RunOnce(ctx, limit); err != nil && !errors.Is(err, context.Canceled) {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
