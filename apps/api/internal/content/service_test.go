package content

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

const testID = "123e4567-e89b-42d3-a456-426614174000"
const secondID = "223e4567-e89b-42d3-a456-426614174000"

type memoryStore struct {
	mu     sync.Mutex
	items  map[string]Item
	audits []AuditEvent
}

func newMemoryStore() *memoryStore { return &memoryStore{items: map[string]Item{}} }
func (store *memoryStore) List(_ context.Context, query Query) ([]Item, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	items := []Item{}
	for _, item := range store.items {
		if item.Kind != query.Kind || query.Category != "" && item.Category != query.Category || query.FeaturedOnly && !item.Featured || query.PublicOnly && !item.PublicAt(query.Now) {
			continue
		}
		if query.Tag != "" {
			found := false
			for _, tag := range item.Tags {
				if tag == query.Tag {
					found = true
				}
			}
			if !found {
				continue
			}
		}
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].PublicID < items[j].PublicID })
	return items, nil
}
func (store *memoryStore) FindByID(_ context.Context, id string) (Item, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	item, ok := store.items[id]
	if !ok {
		return Item{}, ErrNotFound
	}
	return item, nil
}
func (store *memoryStore) FindBySlug(_ context.Context, kind Kind, slug string) (Item, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, item := range store.items {
		if item.Kind == kind && item.Slug == slug {
			return item, nil
		}
	}
	return Item{}, ErrNotFound
}
func (store *memoryStore) Create(_ context.Context, item Item, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, existing := range store.items {
		if existing.Kind == item.Kind && item.Slug != "" && existing.Slug == item.Slug {
			return ErrConflict
		}
	}
	store.items[item.PublicID] = item
	store.audits = append(store.audits, audit)
	return nil
}
func (store *memoryStore) Update(_ context.Context, item Item, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	existing, ok := store.items[item.PublicID]
	if !ok {
		return ErrNotFound
	}
	if existing.PublicID != item.PublicID || existing.Slug != item.Slug || existing.Kind != item.Kind || existing.Revision != item.Revision-1 {
		return ErrConflict
	}
	store.items[item.PublicID] = item
	store.audits = append(store.audits, audit)
	return nil
}
func (store *memoryStore) Delete(_ context.Context, item Item, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if existing, ok := store.items[item.PublicID]; !ok {
		return ErrNotFound
	} else if existing.Revision != item.Revision {
		return ErrConflict
	}
	delete(store.items, item.PublicID)
	store.audits = append(store.audits, audit)
	return nil
}

func TestLifecycleRejectsInvalidSourceStatesAndConcurrentStaleMutation(t *testing.T) {
	domain, store := domainFixture()
	domain.id = UUID
	item, err := domain.Create(t.Context(), editor, validPage())
	if err != nil {
		t.Fatal(err)
	}
	if _, err = domain.Unpublish(t.Context(), approver, item.PublicID, item.Revision); !errors.Is(err, ErrConflict) {
		t.Fatalf("unpublish draft = %v", err)
	}
	results := make(chan error, 2)
	for range 2 {
		go func() {
			_, concurrentErr := domain.Approve(t.Context(), approver, item.PublicID, item.Revision, true)
			results <- concurrentErr
		}()
	}
	successes, conflicts := 0, 0
	for range 2 {
		switch concurrentErr := <-results; {
		case concurrentErr == nil:
			successes++
		case errors.Is(concurrentErr, ErrConflict):
			conflicts++
		default:
			t.Fatalf("concurrent approval = %v", concurrentErr)
		}
	}
	if successes != 1 || conflicts != 1 || len(store.audits) != 2 {
		t.Fatalf("successes=%d conflicts=%d audits=%d", successes, conflicts, len(store.audits))
	}
	current, _ := domain.Preview(t.Context(), editor, item.PublicID)
	if _, err = domain.Schedule(t.Context(), approver, item.PublicID, current.Revision, domain.now().Add(time.Hour), nil); err != nil {
		t.Fatal(err)
	}
	current, _ = domain.Preview(t.Context(), editor, item.PublicID)
	if _, err = domain.Schedule(t.Context(), approver, item.PublicID, current.Revision, domain.now().Add(2*time.Hour), nil); !errors.Is(err, ErrConflict) {
		t.Fatalf("reschedule scheduled = %v", err)
	}
	if _, err = domain.Publish(t.Context(), approver, item.PublicID, current.Revision, nil); !errors.Is(err, ErrConflict) {
		t.Fatalf("publish scheduled before due = %v", err)
	}
	domain.now = func() time.Time { return *current.PublishAt }
	published, err := domain.Publish(t.Context(), approver, item.PublicID, current.Revision, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = domain.Publish(t.Context(), approver, item.PublicID, published.Revision, nil); !errors.Is(err, ErrConflict) {
		t.Fatalf("repeat publish = %v", err)
	}
}

func TestValidationEnforcesContractRuneAndByteMaxima(t *testing.T) {
	domain, _ := domainFixture()
	tooLongASCII := "https://example.invalid/" + strings.Repeat("a", 2049)
	tooManyBytes := "https://example.invalid/" + strings.Repeat("é", 1020)
	for _, input := range []Input{
		{Kind: Video, Title: "Video", ExternalURL: tooLongASCII, EmbedURL: "https://example.invalid/embed"},
		{Kind: Video, Title: "Video", ExternalURL: "https://example.invalid/video", EmbedURL: tooManyBytes},
		{Kind: Press, Title: "Press", Outlet: "Outlet", ExternalURL: tooLongASCII},
		{Kind: Page, Slug: "page", Title: "Page", SEO: SEO{CanonicalURL: tooManyBytes}},
	} {
		if _, err := domain.Create(t.Context(), editor, input); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s oversized URL accepted: %v", input.Kind, err)
		}
	}
}

func domainFixture() (*Domain, *memoryStore) {
	store := newMemoryStore()
	now := time.Date(2026, 8, 5, 15, 0, 0, 0, time.UTC)
	ids := []string{testID, secondID, "323e4567-e89b-42d3-a456-426614174000", "423e4567-e89b-42d3-a456-426614174000", "523e4567-e89b-42d3-a456-426614174000", "623e4567-e89b-42d3-a456-426614174000", "723e4567-e89b-42d3-a456-426614174000"}
	index := 0
	return NewDomain(store, func() time.Time { return now }, func() (string, error) { value := ids[index]; index++; return value, nil }), store
}

var editor = Actor{InternalID: "507f1f77bcf86cd799439011", PublicID: testID, CanEdit: true}
var approver = Actor{InternalID: "507f1f77bcf86cd799439011", PublicID: testID, CanEdit: true, CanApprove: true}

func validPage() Input {
	return Input{Kind: Page, Slug: "About Joe", Title: "About", Body: "Approved biography goes here.", Tags: []string{"Profile", "profile"}, SEO: SEO{Title: "About"}}
}

func TestLifecycleRequiresIndependentApprovalAndHonoursSchedule(t *testing.T) {
	domain, store := domainFixture()
	item, err := domain.Create(context.Background(), editor, validPage())
	if err != nil {
		t.Fatal(err)
	}
	if item.Slug != "about-joe" || item.Status != Draft || item.Approved || len(item.Tags) != 1 {
		t.Fatalf("unexpected draft: %#v", item)
	}
	if _, err = domain.Publish(context.Background(), editor, item.PublicID, item.Revision, nil); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editor publish = %v", err)
	}
	item, err = domain.Approve(context.Background(), approver, item.PublicID, item.Revision, true)
	if err != nil {
		t.Fatal(err)
	}
	future := time.Date(2026, 8, 5, 16, 0, 0, 0, time.UTC)
	item, err = domain.Schedule(context.Background(), approver, item.PublicID, item.Revision, future, nil)
	if err != nil {
		t.Fatal(err)
	}
	if list, err := domain.Public(context.Background(), Query{Kind: Page}); err != nil || len(list) != 0 {
		t.Fatalf("early public result %#v, %v", list, err)
	}
	domain.now = func() time.Time { return future.Add(time.Second) }
	list, err := domain.Public(context.Background(), Query{Kind: Page})
	if err != nil || len(list) != 1 {
		t.Fatalf("due scheduled result %#v, %v", list, err)
	}
	unpublish := future.Add(2 * time.Hour)
	item, err = domain.Publish(context.Background(), approver, item.PublicID, item.Revision, &unpublish)
	if err != nil {
		t.Fatal(err)
	}
	domain.now = func() time.Time { return unpublish }
	list, _ = domain.Public(context.Background(), Query{Kind: Page})
	if len(list) != 0 {
		t.Fatal("expired item remained public")
	}
	if len(store.audits) != 4 {
		t.Fatalf("audit count=%d", len(store.audits))
	}
}

func TestUpdatePreservesIdentityAndRevokesApproval(t *testing.T) {
	domain, _ := domainFixture()
	item, err := domain.Create(context.Background(), editor, validPage())
	if err != nil {
		t.Fatal(err)
	}
	item, err = domain.Approve(context.Background(), approver, item.PublicID, item.Revision, true)
	if err != nil {
		t.Fatal(err)
	}
	item, err = domain.Publish(context.Background(), approver, item.PublicID, item.Revision, nil)
	if err != nil {
		t.Fatal(err)
	}
	updated := validPage()
	updated.Slug = "attempted-change"
	updated.Title = "About updated"
	item, err = domain.Update(context.Background(), editor, item.PublicID, item.Revision, updated)
	if err != nil {
		t.Fatal(err)
	}
	if item.PublicID != testID || item.Slug != "about-joe" || item.Approved || item.Status != Draft {
		t.Fatalf("identity/lifecycle changed incorrectly: %#v", item)
	}
}

func TestValidationIsKindSpecificAndDeleteProtectsLiveContent(t *testing.T) {
	domain, _ := domainFixture()
	cases := []Input{{Kind: Video, Title: "Video", ExternalURL: "http://unsafe.example", EmbedURL: "https://embed.example/v"}, {Kind: Press, Title: "Press", ExternalURL: "https://press.example/story"}, {Kind: Testimonial, Title: "Quote", PersonName: ""}, {Kind: Portfolio, Slug: "work", Title: "Work", Category: ""}}
	for _, input := range cases {
		if _, err := domain.Create(context.Background(), editor, input); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s invalid create = %v", input.Kind, err)
		}
	}
	item, err := domain.Create(context.Background(), editor, validPage())
	if err != nil {
		t.Fatal(err)
	}
	item, err = domain.Approve(context.Background(), approver, item.PublicID, item.Revision, true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = domain.Publish(context.Background(), approver, item.PublicID, item.Revision, nil); err != nil {
		t.Fatal(err)
	}
	if err = domain.Delete(context.Background(), approver, item.PublicID, item.Revision+1); !errors.Is(err, ErrConflict) {
		t.Fatalf("live delete=%v", err)
	}
}

func TestPublicFilteringAndPreviewAuthorization(t *testing.T) {
	domain, _ := domainFixture()
	input := validPage()
	input.Category = "Profile"
	input.Featured = true
	item, err := domain.Create(context.Background(), editor, input)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = domain.Preview(context.Background(), Actor{}, item.PublicID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("preview=%v", err)
	}
	item, err = domain.Approve(context.Background(), approver, item.PublicID, item.Revision, true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = domain.Publish(context.Background(), approver, item.PublicID, item.Revision, nil); err != nil {
		t.Fatal(err)
	}
	items, err := domain.Public(context.Background(), Query{Kind: Page, Category: "Profile", Tag: "Profile", FeaturedOnly: true})
	if err != nil || len(items) != 1 {
		t.Fatalf("filter=%#v %v", items, err)
	}
}
