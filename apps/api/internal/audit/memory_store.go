package audit

import (
	"context"
	"sync"
	"time"
)

type MemoryStore struct {
	mu    sync.Mutex
	Items []Entry
	Err   error
}

func (store *MemoryStore) Search(_ context.Context, query Query) ([]Entry, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.Err != nil {
		return nil, store.Err
	}
	out := []Entry{}
	for _, item := range store.Items {
		if query.Action != "" && item.Action != query.Action {
			continue
		}
		if query.EntityType != "" && item.EntityType != query.EntityType {
			continue
		}
		if query.From != nil && item.CreatedAt.Before(*query.From) {
			continue
		}
		if query.To != nil && item.CreatedAt.After(*query.To) {
			continue
		}
		if query.Text != "" {
			haystack := item.Action + " " + item.EntityType + " " + item.EntityID
			if !containsFold(haystack, query.Text) {
				continue
			}
		}
		out = append(out, item)
		if len(out) >= query.Limit {
			break
		}
	}
	return out, nil
}

func containsFold(haystack, needle string) bool {
	return len(needle) == 0 || (len(haystack) >= len(needle) && (haystack == needle || indexFold(haystack, needle) >= 0))
}

func indexFold(haystack, needle string) int {
	h, n := []rune(haystack), []rune(needle)
	for i := 0; i+len(n) <= len(h); i++ {
		match := true
		for j := range n {
			if toLower(h[i+j]) != toLower(n[j]) {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

func toLower(r rune) rune {
	if r >= 'A' && r <= 'Z' {
		return r + ('a' - 'A')
	}
	return r
}

func sampleEntries() []Entry {
	now := time.Date(2026, 8, 5, 18, 0, 0, 0, time.UTC)
	return []Entry{
		{ID: "10000000-0000-4000-8000-000000000001", Action: "auth.sign_in", EntityType: "auth", EntityID: "user-1", Outcome: "accepted", CreatedAt: now},
		{ID: "10000000-0000-4000-8000-000000000002", Action: "export.bookings", EntityType: "export", EntityID: "bookings", CreatedAt: now.Add(time.Minute)},
		{ID: "10000000-0000-4000-8000-000000000003", Action: "content.publish", EntityType: "content", EntityID: "page-1", CreatedAt: now.Add(2 * time.Minute)},
	}
}
