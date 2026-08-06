package analytics

import (
	"context"
	"sync"
	"time"
)

type MemoryStore struct {
	mu         sync.Mutex
	Events     []ConversionEvent
	Pipeline   map[string]int
	Bookings   map[string]int
	Campaigns  map[string]int
	Content    int
	Audience   []AudienceMetric
	FailAppend bool
}

func (store *MemoryStore) AppendConversion(_ context.Context, event ConversionEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.FailAppend {
		return ErrUnavailable
	}
	store.Events = append(store.Events, event)
	return nil
}

func (store *MemoryStore) CountConversions(_ context.Context, name EventName, since time.Time) (int, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	count := 0
	for _, event := range store.Events {
		if event.OccurredAt.Before(since) {
			continue
		}
		if name != "" && event.Name != name {
			continue
		}
		count++
	}
	return count, nil
}

func (store *MemoryStore) TopProperty(_ context.Context, name EventName, property string, since time.Time, limit int) ([]NamedCount, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	counts := map[string]int{}
	for _, event := range store.Events {
		if event.Name != name || event.OccurredAt.Before(since) {
			continue
		}
		value := event.Properties[property]
		if value == "" {
			continue
		}
		counts[value]++
	}
	out := make([]NamedCount, 0, len(counts))
	for name, count := range counts {
		out = append(out, NamedCount{Name: name, Count: count})
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (store *MemoryStore) PipelineCounts(context.Context) (map[string]int, error) {
	return copyMap(store.Pipeline), nil
}
func (store *MemoryStore) BookingStatusCounts(context.Context) (map[string]int, error) {
	return copyMap(store.Bookings), nil
}
func (store *MemoryStore) CampaignStatusCounts(context.Context) (map[string]int, error) {
	return copyMap(store.Campaigns), nil
}
func (store *MemoryStore) PublishedContentCount(context.Context) (int, error) {
	return store.Content, nil
}
func (store *MemoryStore) AudienceMetrics(_ context.Context, limit int) ([]AudienceMetric, error) {
	if len(store.Audience) > limit {
		return append([]AudienceMetric(nil), store.Audience[:limit]...), nil
	}
	return append([]AudienceMetric(nil), store.Audience...), nil
}

func copyMap(in map[string]int) map[string]int {
	out := map[string]int{}
	for key, value := range in {
		out[key] = value
	}
	return out
}

type RecordingSink struct {
	mu     sync.Mutex
	Events []ConversionEvent
}

func (sink *RecordingSink) Emit(_ context.Context, event ConversionEvent) error {
	sink.mu.Lock()
	defer sink.mu.Unlock()
	sink.Events = append(sink.Events, event)
	return nil
}
