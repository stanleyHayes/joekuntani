package checkin

import (
	"context"
	"sync"
	"testing"
)

func TestAtomicCheckinSingleSuccess(t *testing.T) {
	ctx := context.Background()
	// Reset in-memory store
	storeMu.Lock()
	checked = map[string]bool{}
	storeMu.Unlock()

	res, err := AtomicCheckin(ctx, "EVT-TEST-1", "TICKET-123")
	if err != nil {
		t.Fatalf("expected no error on first checkin, got %v", err)
	}
	if !res.CheckedIn {
		t.Fatalf("expected CheckedIn true")
	}

	// second attempt should fail
	res2, err2 := AtomicCheckin(ctx, "EVT-TEST-1", "TICKET-123")
	if err2 == nil {
		t.Fatalf("expected ErrAlreadyCheckedIn, got nil")
	}
	if err2 != ErrAlreadyCheckedIn {
		t.Fatalf("expected ErrAlreadyCheckedIn, got %v", err2)
	}
	if !res2.CheckedIn {
		t.Fatalf("expected CheckedIn true on duplicate response")
	}
}

func TestAtomicCheckinConcurrent(t *testing.T) {
	ctx := context.Background()
	storeMu.Lock()
	checked = map[string]bool{}
	storeMu.Unlock()

	var wg sync.WaitGroup
	wg.Add(2)
	var errs [2]error
	for i := 0; i < 2; i++ {
		go func(idx int) {
			defer wg.Done()
			_, errs[idx] = AtomicCheckin(ctx, "EVT-TEST-1", "TICKET-999")
		}(i)
	}
	wg.Wait()

	// Exactly one should be nil and the other ErrAlreadyCheckedIn
	nilCount := 0
	reAlready := 0
	for i := 0; i < 2; i++ {
		if errs[i] == nil {
			nilCount++
		} else if errs[i] == ErrAlreadyCheckedIn {
			reAlready++
		} else {
			t.Fatalf("unexpected error: %v", errs[i])
		}
	}
	if nilCount != 1 || reAlready != 1 {
		t.Fatalf("expected 1 success and 1 already-checked error; got success=%d, already=%d", nilCount, reAlready)
	}
}
