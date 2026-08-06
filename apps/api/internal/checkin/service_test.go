package checkin

import (
	"context"
	"sync"
	"testing"
	"time"
)

type memoryStore struct {
	mu      sync.Mutex
	tickets map[string]memoryTicket
	counts  map[string]int64
}

type memoryTicket struct {
	PublicID string
	EventID  string
	Status   string
	At       time.Time
}

func (m *memoryStore) CountCheckedIn(_ context.Context, eventID string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.counts[eventID], nil
}

func (m *memoryStore) Scan(_ context.Context, _ Actor, input ScanInput, at time.Time) (ScanResult, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ticket, ok := m.tickets[input.Token]
	if !ok {
		return ScanResult{Result: ResultInvalid, CheckedInCount: m.counts[input.EventID], Message: "Ticket not recognized"}, nil
	}
	ref := shortRef(ticket.PublicID)
	if ticket.EventID != input.EventID {
		return ScanResult{Result: ResultWrongEvent, TicketRef: ref, CheckedInCount: m.counts[input.EventID]}, nil
	}
	if ticket.Status == "checked_in" {
		checked := ticket.At
		return ScanResult{Result: ResultAlreadyCheckedIn, TicketRef: ref, CheckedInAt: &checked, CheckedInCount: m.counts[input.EventID]}, ErrConflict
	}
	if ticket.Status != "valid" {
		return ScanResult{Result: ResultNotValid, TicketRef: ref, CheckedInCount: m.counts[input.EventID]}, nil
	}
	ticket.Status = "checked_in"
	ticket.At = at
	m.tickets[input.Token] = ticket
	m.counts[input.EventID]++
	return ScanResult{Result: ResultAdmitted, TicketRef: ref, CheckedInAt: &at, CheckedInCount: m.counts[input.EventID], Message: "Admitted"}, nil
}

func TestScanAdmitsOnceAndRejectsDuplicate(t *testing.T) {
	t.Parallel()
	store := &memoryStore{
		tickets: map[string]memoryTicket{"bearer-token-123456": {PublicID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c299", EventID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", Status: "valid"}},
		counts:  map[string]int64{},
	}
	service := NewService(store)
	actor := Actor{InternalID: "507f1f77bcf86cd799439011"}
	first, err := service.Scan(context.Background(), actor, ScanInput{EventID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", Token: "bearer-token-123456"})
	if err != nil || first.Result != ResultAdmitted || first.CheckedInCount != 1 {
		t.Fatalf("first scan = %#v err=%v", first, err)
	}
	second, err := service.Scan(context.Background(), actor, ScanInput{EventID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", Token: "bearer-token-123456"})
	if err != ErrConflict || second.Result != ResultAlreadyCheckedIn {
		t.Fatalf("second scan = %#v err=%v", second, err)
	}
}

func TestScanRejectsWrongEventAndInvalidToken(t *testing.T) {
	t.Parallel()
	store := &memoryStore{
		tickets: map[string]memoryTicket{"bearer-token-123456": {PublicID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c299", EventID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", Status: "valid"}},
		counts:  map[string]int64{},
	}
	service := NewService(store)
	actor := Actor{InternalID: "507f1f77bcf86cd799439011"}
	wrong, err := service.Scan(context.Background(), actor, ScanInput{EventID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c202", Token: "bearer-token-123456"})
	if err != nil || wrong.Result != ResultWrongEvent {
		t.Fatalf("wrong event = %#v err=%v", wrong, err)
	}
	invalid, err := service.Scan(context.Background(), actor, ScanInput{EventID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", Token: "unknown-token-abcdef"})
	if err != nil || invalid.Result != ResultInvalid {
		t.Fatalf("invalid = %#v err=%v", invalid, err)
	}
}

func TestConcurrentScanAdmitsExactlyOnce(t *testing.T) {
	t.Parallel()
	store := &memoryStore{
		tickets: map[string]memoryTicket{"bearer-token-123456": {PublicID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c299", EventID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", Status: "valid"}},
		counts:  map[string]int64{},
	}
	service := NewService(store)
	actor := Actor{InternalID: "507f1f77bcf86cd799439011"}
	var wg sync.WaitGroup
	results := make([]Result, 2)
	errs := make([]error, 2)
	wg.Add(2)
	for i := 0; i < 2; i++ {
		go func(idx int) {
			defer wg.Done()
			out, err := service.Scan(context.Background(), actor, ScanInput{EventID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", Token: "bearer-token-123456"})
			results[idx] = out.Result
			errs[idx] = err
		}(i)
	}
	wg.Wait()
	admitted, conflict := 0, 0
	for i := 0; i < 2; i++ {
		if results[i] == ResultAdmitted && errs[i] == nil {
			admitted++
		}
		if results[i] == ResultAlreadyCheckedIn {
			conflict++
		}
	}
	if admitted != 1 || conflict != 1 {
		t.Fatalf("admitted=%d conflict=%d results=%v errs=%v", admitted, conflict, results, errs)
	}
}
