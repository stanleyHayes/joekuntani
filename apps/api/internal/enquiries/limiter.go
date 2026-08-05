package enquiries

import (
	"context"
	"sync"
	"time"
)

type rateWindow struct {
	started time.Time
	count   int
}

// WindowLimiter is a bounded in-process edge guard. Production composition can
// inject a distributed implementation with the same fail-closed contract.
type WindowLimiter struct {
	mu         sync.Mutex
	now        func() time.Time
	window     time.Duration
	limit      int
	maxEntries int
	entries    map[string]rateWindow
}

func NewWindowLimiter(limit int, window time.Duration, maxEntries int) *WindowLimiter {
	return &WindowLimiter{now: time.Now, limit: limit, window: window, maxEntries: maxEntries, entries: map[string]rateWindow{}}
}

func (limiter *WindowLimiter) Allow(_ context.Context, key string) (bool, error) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	now := limiter.now().UTC()
	current, exists := limiter.entries[key]
	if !exists && len(limiter.entries) >= limiter.maxEntries {
		for candidate, entry := range limiter.entries {
			if now.Sub(entry.started) >= limiter.window {
				delete(limiter.entries, candidate)
			}
		}
		if len(limiter.entries) >= limiter.maxEntries {
			return false, nil
		}
	}
	if !exists || now.Sub(current.started) >= limiter.window {
		limiter.entries[key] = rateWindow{started: now, count: 1}
		return true, nil
	}
	if current.count >= limiter.limit {
		return false, nil
	}
	current.count++
	limiter.entries[key] = current
	return true, nil
}
