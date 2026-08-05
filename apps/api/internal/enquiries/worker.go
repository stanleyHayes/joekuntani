package enquiries

import (
	"context"
	"math"
	"time"
)

type OutboxStore interface {
	ClaimDue(context.Context, time.Time, int) ([]OutboxMessage, error)
	Complete(context.Context, string) error
	Retry(context.Context, string, int, time.Time, *time.Time) error
}
type Sender interface {
	Send(context.Context, OutboxMessage) error
}
type Worker struct {
	store       OutboxStore
	sender      Sender
	now         func() time.Time
	maxAttempts int
}

func NewWorker(store OutboxStore, sender Sender) *Worker {
	return &Worker{store: store, sender: sender, now: time.Now, maxAttempts: 8}
}
func (w *Worker) RunOnce(ctx context.Context) error {
	messages, err := w.store.ClaimDue(ctx, w.now().UTC(), 50)
	if err != nil {
		return err
	}
	for _, message := range messages {
		if err := w.sender.Send(ctx, message); err == nil {
			if err = w.store.Complete(ctx, message.PublicID); err != nil {
				return err
			}
			continue
		}
		attempt := message.Attempts + 1
		delay := time.Duration(math.Min(math.Pow(2, float64(attempt)), 3600)) * time.Second
		next := w.now().UTC().Add(delay)
		var dead *time.Time
		if attempt >= w.maxAttempts {
			at := w.now().UTC()
			dead = &at
		}
		if err = w.store.Retry(ctx, message.PublicID, attempt, next, dead); err != nil {
			return err
		}
	}
	return nil
}
