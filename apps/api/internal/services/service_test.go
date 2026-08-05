package services

import (
	"context"
	"errors"
	"sort"
	"sync"
	"testing"
	"time"
)

const (
	idOne = "11111111-1111-4111-8111-111111111111"
	idTwo = "22222222-2222-4222-8222-222222222222"
)

type memoryStore struct {
	mu     sync.Mutex
	items  map[string]Service
	audits []AuditEvent
}

func newMemoryStore() *memoryStore { return &memoryStore{items: map[string]Service{}} }
func (store *memoryStore) List(_ context.Context, activeOnly bool) ([]Service, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	result := []Service{}
	for _, item := range store.items {
		if !activeOnly || item.Active && item.RetiredAt == nil {
			result = append(result, item)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].SortOrder == result[j].SortOrder {
			return result[i].Name < result[j].Name
		}
		return result[i].SortOrder < result[j].SortOrder
	})
	return result, nil
}
func (store *memoryStore) FindBySlug(_ context.Context, slug string) (Service, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, item := range store.items {
		if item.Slug == slug {
			return item, nil
		}
	}
	return Service{}, ErrNotFound
}
func (store *memoryStore) FindByID(_ context.Context, id string) (Service, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	item, ok := store.items[id]
	if !ok {
		return Service{}, ErrNotFound
	}
	return item, nil
}
func (store *memoryStore) Create(_ context.Context, item Service, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, existing := range store.items {
		if existing.Slug == item.Slug || existing.PublicID == item.PublicID {
			return ErrConflict
		}
	}
	store.items[item.PublicID], store.audits = item, append(store.audits, audit)
	return nil
}
func (store *memoryStore) Update(_ context.Context, item Service, expectedVersion int64, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	current, ok := store.items[item.PublicID]
	if !ok {
		return ErrNotFound
	}
	if current.RetiredAt != nil || current.Version != expectedVersion {
		return ErrConflict
	}
	item.Version = expectedVersion + 1
	store.items[item.PublicID], store.audits = item, append(store.audits, audit)
	return nil
}
func (store *memoryStore) SetActive(_ context.Context, id string, active bool, expectedVersion int64, updatedAt time.Time, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	item, ok := store.items[id]
	if !ok {
		return ErrNotFound
	}
	if item.RetiredAt != nil || item.Version != expectedVersion {
		return ErrConflict
	}
	item.Active, item.UpdatedAt, item.Version = active, updatedAt, item.Version+1
	store.items[id], store.audits = item, append(store.audits, audit)
	return nil
}
func (store *memoryStore) Retire(_ context.Context, id string, expectedVersion int64, updatedAt time.Time, audit AuditEvent) (Service, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	item, ok := store.items[id]
	if !ok {
		return Service{}, ErrNotFound
	}
	if item.RetiredAt != nil {
		return item, nil
	}
	if item.Version != expectedVersion {
		return Service{}, ErrConflict
	}
	item.Active, item.RetiredAt, item.UpdatedAt, item.Version = false, &updatedAt, updatedAt, item.Version+1
	store.items[id], store.audits = item, append(store.audits, audit)
	return item, nil
}
func (store *memoryStore) Reorder(_ context.Context, items []OrderItem, updatedAt time.Time, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	activeCount := 0
	for _, item := range store.items {
		if item.RetiredAt == nil {
			activeCount++
		}
	}
	if len(items) != activeCount {
		return ErrConflict
	}
	for _, ordered := range items {
		item, ok := store.items[ordered.ID]
		if !ok || item.RetiredAt != nil || item.Version != ordered.Version {
			return ErrConflict
		}
	}
	for order, ordered := range items {
		item := store.items[ordered.ID]
		item.SortOrder, item.UpdatedAt, item.Version = order, updatedAt, item.Version+1
		store.items[ordered.ID] = item
	}
	store.audits = append(store.audits, audit)
	return nil
}

func validInput(name string, order int) Input {
	return Input{Name: name, Summary: "Content awaiting approval.", Category: "Custom partnership", Active: true, SortOrder: order, CTA: CTA{Label: "Start an enquiry", Href: "/book"}, FormSchema: FormSchema{Version: 1, Questions: []Question{{Key: "objective", Label: "What would you like to achieve?", Type: QuestionTextarea, Required: true}, {Key: "platforms", Label: "Which platforms?", Type: QuestionMultiSelect, Options: []string{"Option one", "Option two"}}}}}
}

func testDomain(store Store, ids ...string) *Domain {
	index := 0
	return NewDomain(store, func() time.Time { return time.Date(2026, 8, 5, 14, 30, index, 0, time.UTC) }, func() (string, error) {
		if index >= len(ids) {
			return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nil
		}
		id := ids[index]
		index++
		return id, nil
	})
}

func TestCreateNormalizesStableIdentifiersAndAudits(t *testing.T) {
	store := newMemoryStore()
	domain := testDomain(store, idOne, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
	created, err := domain.Create(context.Background(), Actor{InternalID: "64f000000000000000000001", CanEdit: true}, validInput("  Brand Partnerships  ", 2))
	if err != nil {
		t.Fatal(err)
	}
	if created.PublicID != idOne || created.Slug != "brand-partnerships" || len(store.audits) != 1 || store.audits[0].Action != "service.create" {
		t.Fatalf("unexpected create result: %#v audits=%#v", created, store.audits)
	}
	updated, err := domain.Update(context.Background(), Actor{InternalID: "64f000000000000000000001", CanEdit: true}, idOne, created.Version, validInput("Renamed service", 4))
	if err != nil {
		t.Fatal(err)
	}
	if updated.Slug != created.Slug || updated.PublicID != created.PublicID {
		t.Fatalf("stable identifiers changed: %#v", updated)
	}
}

func TestPublicLifecycleAndOrdering(t *testing.T) {
	store := newMemoryStore()
	domain := testDomain(store, idOne, idTwo, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
	actor := Actor{InternalID: "64f000000000000000000001", CanEdit: true}
	first, _ := domain.Create(context.Background(), actor, validInput("Later", 20))
	second, _ := domain.Create(context.Background(), actor, validInput("Sooner", 10))
	public, err := domain.Public(context.Background())
	if err != nil || len(public) != 2 || public[0].PublicID != second.PublicID {
		t.Fatalf("incorrect public order: %#v, %v", public, err)
	}
	if err := domain.SetActive(context.Background(), actor, second.PublicID, false, second.Version); err != nil {
		t.Fatal(err)
	}
	public, _ = domain.Public(context.Background())
	if len(public) != 1 || public[0].PublicID != first.PublicID {
		t.Fatalf("inactive service leaked: %#v", public)
	}
	if _, err := domain.BySlug(context.Background(), second.Slug); !errors.Is(err, ErrNotFound) {
		t.Fatalf("inactive slug must be hidden, got %v", err)
	}
	if err := domain.Reorder(context.Background(), actor, []OrderItem{{ID: second.PublicID, Version: second.Version + 1}, {ID: first.PublicID, Version: first.Version}}); err != nil {
		t.Fatal(err)
	}
	all, _ := domain.All(context.Background(), actor)
	if all[0].PublicID != second.PublicID || all[0].SortOrder != 0 || all[1].SortOrder != 1 {
		t.Fatalf("reorder failed: %#v", all)
	}
}

func TestValidationAuthorizationAndSchemaRules(t *testing.T) {
	store := newMemoryStore()
	domain := testDomain(store, idOne)
	input := validInput("Valid service", 0)
	if _, err := domain.Create(context.Background(), Actor{}, input); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
	input.FormSchema.Questions[1].Options = []string{"duplicate", "Duplicate"}
	if _, err := domain.Create(context.Background(), Actor{InternalID: "64f000000000000000000001", CanEdit: true}, input); !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected invalid duplicate options, got %v", err)
	}
	input = validInput("Valid service", 0)
	input.CTA.Href = "https://unapproved.example"
	if err := input.Validate(); !errors.Is(err, ErrInvalid) {
		t.Fatalf("external CTA must be rejected, got %v", err)
	}
	if _, err := domain.BySlug(context.Background(), "INVALID/SLUG"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unsafe slug must not reach store, got %v", err)
	}
}

func TestRetireIsAuditedIdempotentAndPreservesHistory(t *testing.T) {
	store := newMemoryStore()
	domain := testDomain(store, idOne, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
	actor := Actor{InternalID: "64f000000000000000000001", CanEdit: true}
	created, err := domain.Create(context.Background(), actor, validInput("Retirable service", 0))
	if err != nil {
		t.Fatal(err)
	}
	retired, err := domain.Retire(context.Background(), actor, created.PublicID, created.Version)
	if err != nil || retired.State() != StateRetired || retired.Active || retired.Version != 2 {
		t.Fatalf("unexpected retirement: %#v, %v", retired, err)
	}
	retried, err := domain.Retire(context.Background(), actor, created.PublicID, created.Version)
	if err != nil || retried.Version != retired.Version || len(store.audits) != 2 {
		t.Fatalf("retry must be idempotent without a second audit: %#v audits=%#v err=%v", retried, store.audits, err)
	}
	if public, _ := domain.Public(context.Background()); len(public) != 0 {
		t.Fatalf("retired service leaked publicly: %#v", public)
	}
	if all, _ := domain.All(context.Background(), actor); len(all) != 1 || all[0].State() != StateRetired {
		t.Fatalf("retired history was not preserved: %#v", all)
	}
	if err := domain.SetActive(context.Background(), actor, created.PublicID, true, retired.Version); !errors.Is(err, ErrConflict) {
		t.Fatalf("retired service must be immutable, got %v", err)
	}
}

func TestConcurrentMutationsUseCompareAndSwap(t *testing.T) {
	actor := Actor{InternalID: "64f000000000000000000001", CanEdit: true}
	tests := []struct {
		name              string
		idempotentSuccess bool
		run               func(*Domain, Service) error
	}{
		{name: "update", run: func(domain *Domain, item Service) error {
			_, err := domain.Update(context.Background(), actor, item.PublicID, item.Version, validInput("Concurrent update", 0))
			return err
		}},
		{name: "active", run: func(domain *Domain, item Service) error {
			return domain.SetActive(context.Background(), actor, item.PublicID, false, item.Version)
		}},
		{name: "retire", idempotentSuccess: true, run: func(domain *Domain, item Service) error {
			_, err := domain.Retire(context.Background(), actor, item.PublicID, item.Version)
			return err
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			store := newMemoryStore()
			creator := testDomain(store, idOne, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
			created, err := creator.Create(context.Background(), actor, validInput("Concurrent service", 0))
			if err != nil {
				t.Fatal(err)
			}
			domain := NewDomain(store, func() time.Time { return time.Date(2026, 8, 5, 16, 0, 0, 0, time.UTC) }, UUID)
			start := make(chan struct{})
			results := make(chan error, 2)
			for range 2 {
				go func() { <-start; results <- test.run(domain, created) }()
			}
			close(start)
			first, second := <-results, <-results
			if test.idempotentSuccess {
				if first != nil || second != nil || len(store.audits) != 2 {
					t.Fatalf("concurrent retirement retries must converge with one retire audit: first=%v second=%v audits=%#v", first, second, store.audits)
				}
				return
			}
			if (first == nil) == (second == nil) || !(errors.Is(first, ErrConflict) || errors.Is(second, ErrConflict)) {
				t.Fatalf("exactly one mutation must win: first=%v second=%v", first, second)
			}
		})
	}
}

func TestConcurrentReorderUsesEveryExpectedVersion(t *testing.T) {
	store := newMemoryStore()
	creator := testDomain(store, idOne, idTwo, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
	actor := Actor{InternalID: "64f000000000000000000001", CanEdit: true}
	first, _ := creator.Create(context.Background(), actor, validInput("First", 0))
	second, _ := creator.Create(context.Background(), actor, validInput("Second", 1))
	domain := NewDomain(store, func() time.Time { return time.Date(2026, 8, 5, 16, 0, 0, 0, time.UTC) }, UUID)
	orders := [][]OrderItem{
		{{ID: first.PublicID, Version: first.Version}, {ID: second.PublicID, Version: second.Version}},
		{{ID: second.PublicID, Version: second.Version}, {ID: first.PublicID, Version: first.Version}},
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, order := range orders {
		go func(items []OrderItem) { <-start; results <- domain.Reorder(context.Background(), actor, items) }(order)
	}
	close(start)
	firstErr, secondErr := <-results, <-results
	if (firstErr == nil) == (secondErr == nil) || !(errors.Is(firstErr, ErrConflict) || errors.Is(secondErr, ErrConflict)) {
		t.Fatalf("exactly one reorder must win: first=%v second=%v", firstErr, secondErr)
	}
}
