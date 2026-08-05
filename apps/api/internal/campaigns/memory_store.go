package campaigns

import (
	"context"
	"sync"
	"time"
)

type MemoryStore struct {
	mu           sync.Mutex
	campaigns    map[string]Campaign
	deliverables map[string]Deliverable
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{campaigns: map[string]Campaign{}, deliverables: map[string]Deliverable{}}
}
func (s *MemoryStore) Create(_ context.Context, item Campaign, _ Actor) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.campaigns[item.PublicID]; ok {
		return ErrConflict
	}
	s.campaigns[item.PublicID] = item
	return nil
}
func (s *MemoryStore) Update(_ context.Context, item Campaign, _ Actor) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.campaigns[item.PublicID]; !ok {
		return ErrNotFound
	}
	s.campaigns[item.PublicID] = item
	return nil
}
func (s *MemoryStore) Find(_ context.Context, id string) (Campaign, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.campaigns[id]
	if !ok || item.DeletedAt != nil {
		return Campaign{}, ErrNotFound
	}
	return item, nil
}
func (s *MemoryStore) List(_ context.Context, filter Filter) ([]Campaign, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []Campaign{}
	for _, item := range s.campaigns {
		if !filter.IncludeDeleted && item.DeletedAt != nil {
			continue
		}
		if filter.Status != "" && item.Status != filter.Status {
			continue
		}
		if filter.OrganizationID != "" && item.OrganizationID != filter.OrganizationID {
			continue
		}
		if filter.Platform != "" && !contains(item.Platforms, filter.Platform) {
			continue
		}
		out = append(out, item)
	}
	return out, nil
}
func (s *MemoryStore) SoftDelete(_ context.Context, id string, at time.Time, _ Actor) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.campaigns[id]
	if !ok {
		return ErrNotFound
	}
	item.DeletedAt, item.UpdatedAt = &at, at
	s.campaigns[id] = item
	return nil
}
func (s *MemoryStore) CreateDeliverable(_ context.Context, item Deliverable, _ Actor) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.deliverables[item.PublicID]; ok {
		return ErrConflict
	}
	s.deliverables[item.PublicID] = item
	return nil
}
func (s *MemoryStore) UpdateDeliverable(_ context.Context, item Deliverable, _ Actor) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.deliverables[item.PublicID]; !ok {
		return ErrNotFound
	}
	s.deliverables[item.PublicID] = item
	return nil
}
func (s *MemoryStore) FindDeliverable(_ context.Context, campaignID, id string) (Deliverable, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.deliverables[id]
	if !ok || item.CampaignID != campaignID {
		return Deliverable{}, ErrNotFound
	}
	return item, nil
}
func (s *MemoryStore) ListDeliverables(_ context.Context, campaignID string) ([]Deliverable, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []Deliverable{}
	for _, item := range s.deliverables {
		if item.CampaignID == campaignID {
			out = append(out, item)
		}
	}
	return out, nil
}
func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
