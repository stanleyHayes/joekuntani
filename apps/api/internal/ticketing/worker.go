package ticketing

import (
	"context"
	"time"
)

type ExpiryWorker struct {
	service  *Service
	interval time.Duration
}

func NewExpiryWorker(service *Service, interval time.Duration) *ExpiryWorker {
	if interval <= 0 {
		interval = 30 * time.Second
	}
	return &ExpiryWorker{service: service, interval: interval}
}
func (w *ExpiryWorker) Run(ctx context.Context) error {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		if _, err := w.service.Expire(ctx, 100); err != nil {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
