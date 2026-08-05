package checkin

// Service layer scaffolding for JK-025 check-in domain.
// Keep logic minimal and deterministic so unit tests can be added.

import (
	"context"
	"errors"
	"sync"
	"time"
)

// TicketLookupResult is a minimal domain result for a ticket lookup by token/hash.
type TicketLookupResult struct {
	OrderReference string
	EventID        string
	TicketID       string
	CheckedIn      bool
	CheckedAt      *time.Time
}

// In-memory store used for deterministic unit tests. Production implementations should
// use the repository's MongoDB store with transactions and append-only audits.
var (
	storeMu sync.Mutex
	// map[ticketID]checked
	checked = map[string]bool{}
)

var ErrAlreadyCheckedIn = errors.New("already checked in")

// LookupTicketByToken finds a ticket by its bearer token. In this scaffold,
// a token of "test-token" returns a deterministic ticket used by unit tests.
func LookupTicketByToken(ctx context.Context, token string) (*TicketLookupResult, error) {
	if token == "test-token" {
		return &TicketLookupResult{
			OrderReference: "ORD-TEST-1",
			EventID:        "EVT-TEST-1",
			TicketID:       "TICKET-123",
			CheckedIn:      false,
		}, nil
	}
	return nil, nil
}

// AtomicCheckin attempts to atomically mark a ticket as checked-in and returns the resulting masked state.
// This in-memory version uses a mutex to simulate atomic behavior for unit tests.
func AtomicCheckin(ctx context.Context, eventID, ticketID string) (*TicketLookupResult, error) {
	storeMu.Lock()
	defer storeMu.Unlock()

	if checked[ticketID] {
		return &TicketLookupResult{TicketID: ticketID, CheckedIn: true}, ErrAlreadyCheckedIn
	}
	// Mark checked
	checked[ticketID] = true
	now := time.Now().UTC()
	return &TicketLookupResult{TicketID: ticketID, CheckedIn: true, CheckedAt: &now}, nil
}
