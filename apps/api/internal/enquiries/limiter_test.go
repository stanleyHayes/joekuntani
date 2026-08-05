package enquiries

import (
	"context"
	"testing"
	"time"
)

func TestWindowLimiterIsBoundedAndResets(t *testing.T) {
	now := time.Date(2026, 8, 5, 16, 0, 0, 0, time.UTC)
	limiter := NewWindowLimiter(2, time.Minute, 1)
	limiter.now = func() time.Time { return now }
	for attempt, want := range []bool{true, true, false} {
		got, err := limiter.Allow(context.Background(), "first")
		if err != nil || got != want {
			t.Fatalf("attempt %d = %v, %v; want %v", attempt, got, err, want)
		}
	}
	if allowed, _ := limiter.Allow(context.Background(), "second"); allowed {
		t.Fatal("bounded limiter admitted a new key at capacity")
	}
	now = now.Add(time.Minute)
	if allowed, _ := limiter.Allow(context.Background(), "second"); !allowed {
		t.Fatal("expired window did not release bounded capacity")
	}
}

type workerStore struct {
	messages []OutboxMessage
	complete int
	retries  []OutboxMessage
}

func (store *workerStore) ClaimDue(context.Context, time.Time, int) ([]OutboxMessage, error) {
	return store.messages, nil
}
func (store *workerStore) Complete(context.Context, string) error { store.complete++; return nil }
func (store *workerStore) Retry(_ context.Context, id string, attempts int, next time.Time, dead *time.Time) error {
	store.retries = append(store.retries, OutboxMessage{PublicID: id, Attempts: attempts, NextAttemptAt: next, DeadLetteredAt: dead})
	return nil
}

type sender struct{ fail map[string]bool }

func (sender sender) Send(_ context.Context, message OutboxMessage) error {
	if sender.fail[message.PublicID] {
		return ErrUnavailable
	}
	return nil
}

func TestWorkerCompletesRetriesAndDeadLetters(t *testing.T) {
	store := &workerStore{messages: []OutboxMessage{{PublicID: "ok"}, {PublicID: "retry", Attempts: 2}, {PublicID: "dead", Attempts: 7}}}
	worker := NewWorker(store, sender{fail: map[string]bool{"retry": true, "dead": true}})
	worker.now = func() time.Time { return time.Date(2026, 8, 5, 16, 0, 0, 0, time.UTC) }
	if err := worker.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if store.complete != 1 || len(store.retries) != 2 || store.retries[0].DeadLetteredAt != nil || store.retries[1].DeadLetteredAt == nil {
		t.Fatalf("unexpected worker results: %#v", store)
	}
}
