package privacy

import (
	"context"
	"sync"
	"time"
)

type MemoryStore struct {
	mu         sync.Mutex
	Holds      map[string]Hold
	Enquiries  []EnquiryCandidate
	Audits     []string
	FailStatus bool
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{Holds: map[string]Hold{}}
}

func (store *MemoryStore) Status(_ context.Context, _, cutoff time.Time) (Status, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.FailStatus {
		return Status{}, ErrUnavailable
	}
	eligible := 0
	for _, item := range store.Enquiries {
		if item.UpdatedAt.Before(cutoff) && item.Email != "" && item.Email != anonymizedEmail {
			eligible++
		}
	}
	active := 0
	for _, hold := range store.Holds {
		if hold.ClearedAt == nil {
			active++
		}
	}
	return Status{EligibleCount: eligible, ActiveHolds: active}, nil
}

func (store *MemoryStore) PlaceHold(_ context.Context, hold Hold) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if existing, ok := store.Holds[hold.ContactID]; ok && existing.ClearedAt == nil {
		return ErrConflict
	}
	store.Holds[hold.ContactID] = hold
	return nil
}

func (store *MemoryStore) ClearHold(_ context.Context, contactID string, at time.Time) (Hold, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	hold, ok := store.Holds[contactID]
	if !ok || hold.ClearedAt != nil {
		return Hold{}, ErrNotFound
	}
	hold.ClearedAt = &at
	store.Holds[contactID] = hold
	return hold, nil
}

func (store *MemoryStore) HasActiveHold(_ context.Context, contactID string) (bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	hold, ok := store.Holds[contactID]
	return ok && hold.ClearedAt == nil, nil
}

func (store *MemoryStore) ListActiveHolds(_ context.Context, limit int) ([]Hold, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	out := make([]Hold, 0, len(store.Holds))
	for _, hold := range store.Holds {
		if hold.ClearedAt == nil {
			out = append(out, hold)
			if len(out) >= limit {
				break
			}
		}
	}
	return out, nil
}

func (store *MemoryStore) ListEligibleEnquiries(_ context.Context, cutoff time.Time, limit int) ([]EnquiryCandidate, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	out := make([]EnquiryCandidate, 0, limit)
	for _, item := range store.Enquiries {
		if item.UpdatedAt.Before(cutoff) && item.Email != "" && item.Email != anonymizedEmail {
			out = append(out, item)
			if len(out) >= limit {
				break
			}
		}
	}
	return out, nil
}

func (store *MemoryStore) PurgeEnquiry(_ context.Context, candidate EnquiryCandidate, _ time.Time) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	for i, item := range store.Enquiries {
		if item.PublicID == candidate.PublicID {
			store.Enquiries[i].Email = anonymizedEmail
			return nil
		}
	}
	return ErrNotFound
}

func (store *MemoryStore) RecordAudit(_ context.Context, actorID, action, entityType, entityID string, at time.Time) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.Audits = append(store.Audits, action+":"+entityType+":"+entityID+":"+actorID+":"+at.UTC().Format(time.RFC3339))
	return nil
}
