package exports

import (
	"context"
	"sync"
	"time"
)

type MemoryStore struct {
	mu        sync.Mutex
	Enquiries Result
	Contacts  Result
	Bookings  Result
	Campaigns Result
	Audits    []string
	FailAudit bool
	FailList  bool
}

func (store *MemoryStore) ListEnquiries(_ context.Context, _ int) (Result, error) {
	if store.FailList {
		return Result{}, ErrUnavailable
	}
	return cloneResult(store.Enquiries, "enquiries.csv"), nil
}
func (store *MemoryStore) ListContacts(_ context.Context, _ int) (Result, error) {
	if store.FailList {
		return Result{}, ErrUnavailable
	}
	return cloneResult(store.Contacts, "contacts.csv"), nil
}
func (store *MemoryStore) ListBookings(_ context.Context, _ int) (Result, error) {
	if store.FailList {
		return Result{}, ErrUnavailable
	}
	return cloneResult(store.Bookings, "bookings.csv"), nil
}
func (store *MemoryStore) ListCampaigns(_ context.Context, _ int) (Result, error) {
	if store.FailList {
		return Result{}, ErrUnavailable
	}
	return cloneResult(store.Campaigns, "campaigns.csv"), nil
}
func (store *MemoryStore) RecordExport(_ context.Context, actor Actor, resource Resource, rows int, at time.Time) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.FailAudit {
		return ErrUnavailable
	}
	store.Audits = append(store.Audits, string(resource)+":"+actor.UserID+":"+at.UTC().Format(time.RFC3339)+":"+itoa(rows))
	return nil
}

func cloneResult(result Result, filename string) Result {
	if result.Filename == "" {
		result.Filename = filename
	}
	if result.Header == nil {
		result.Header = []string{}
	}
	if result.Rows == nil {
		result.Rows = []Row{}
	}
	return result
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := []byte{}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}
