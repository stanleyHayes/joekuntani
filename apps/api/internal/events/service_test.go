package events

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

var testNow = time.Date(2026, 8, 5, 15, 0, 0, 0, time.UTC)

func testIDs() func() (string, error) {
	var mutex sync.Mutex
	next := 0
	return func() (string, error) {
		mutex.Lock()
		defer mutex.Unlock()
		next++
		return fmt.Sprintf("00000000-0000-4000-8000-%012d", next), nil
	}
}

func validEventInput() EventInput {
	bannerStart := testNow.Add(24 * time.Hour)
	bannerEnd := testNow.Add(48 * time.Hour)
	return EventInput{
		Title: "Approved event title", Summary: "Approved summary", Description: "Approved event description.", Timezone: "Africa/Accra", Capacity: 100,
		StartsAt: testNow.Add(7 * 24 * time.Hour), EndsAt: testNow.Add(7*24*time.Hour + 3*time.Hour), BannerAssetID: "00000000-0000-4000-8000-000000000099",
		Venue:    Venue{Name: "Approved venue", Address: "Approved address", City: "Accra", CountryCode: "GH", Accessibility: "Step-free entrance available."},
		Policies: Policies{Refunds: "Approved refund policy.", Entry: "Approved entry policy.", AgeLimit: 18, AgeGuidance: "Adults only."},
		Banner:   BannerSchedule{Featured: true, StartsAt: &bannerStart, EndsAt: &bannerEnd},
	}
}

func validTicketInput() TicketInput {
	return TicketInput{Name: "General admission", Description: "Standard access.", Price: "150.00", Currency: "GHS", Capacity: 60, MinPerOrder: 1, MaxPerOrder: 6, SalesStart: testNow.Add(time.Hour), SalesEnd: testNow.Add(6 * 24 * time.Hour), SortOrder: 0}
}

func setupService() (*Service, *MemoryStore, Actor) {
	store := NewMemoryStore()
	service := NewService(store, func() time.Time { return testNow }, testIDs())
	return service, store, Actor{InternalID: "64d2f4e8c2f4e8c2f4e8c2f4", CanManage: true}
}

func TestLifecyclePreservesSlugAndRejectsArbitraryTransitions(t *testing.T) {
	service, _, actor := setupService()
	event, err := service.Create(context.Background(), actor, validEventInput())
	if err != nil || event.Status != EventDraft || event.Slug != "approved-event-title" {
		t.Fatalf("create = %#v, %v", event, err)
	}
	updatedInput := validEventInput()
	updatedInput.Title = "Renamed approved event"
	updated, err := service.Update(context.Background(), actor, event.PublicID, updatedInput)
	if err != nil || updated.Slug != event.Slug {
		t.Fatalf("immutable slug changed: %#v %v", updated, err)
	}
	if _, err = service.Publish(context.Background(), actor, event.PublicID); !errors.Is(err, ErrConflict) {
		t.Fatalf("event without tickets published: %v", err)
	}
	ticket, err := service.CreateTicket(context.Background(), actor, event.PublicID, validTicketInput())
	if err != nil || ticket.Price != "150.00" || ticket.Currency != "GHS" {
		t.Fatalf("ticket = %#v, %v", ticket, err)
	}
	published, err := service.Publish(context.Background(), actor, event.PublicID)
	if err != nil || published.Status != EventPublished || published.PublishedAt == nil {
		t.Fatalf("publish = %#v, %v", published, err)
	}
	if _, err = service.Publish(context.Background(), actor, event.PublicID); !errors.Is(err, ErrConflict) {
		t.Fatalf("repeat publish = %v", err)
	}
	cancelled, err := service.Cancel(context.Background(), actor, event.PublicID)
	if err != nil || cancelled.Status != EventCancelled || cancelled.CancelledAt == nil {
		t.Fatalf("cancel = %#v, %v", cancelled, err)
	}
}

func TestValidationCapacitySalesAndBannerRules(t *testing.T) {
	service, _, actor := setupService()
	bad := validEventInput()
	bad.Banner.EndsAt = nil
	if _, err := service.Create(context.Background(), actor, bad); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid featured banner accepted: %v", err)
	}
	event, _ := service.Create(context.Background(), actor, validEventInput())
	ticket := validTicketInput()
	ticket.Price = "12.345"
	if _, err := service.CreateTicket(context.Background(), actor, event.PublicID, ticket); !errors.Is(err, ErrInvalid) {
		t.Fatalf("non-currency price accepted: %v", err)
	}
	ticket = validTicketInput()
	ticket.MaxPerOrder = 0
	if _, err := service.CreateTicket(context.Background(), actor, event.PublicID, ticket); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid order limits accepted: %v", err)
	}
	first, _ := service.CreateTicket(context.Background(), actor, event.PublicID, validTicketInput())
	second := validTicketInput()
	second.Name, second.Capacity, second.SortOrder = "Premium", 50, 1
	if _, err := service.CreateTicket(context.Background(), actor, event.PublicID, second); !errors.Is(err, ErrConflict) {
		t.Fatalf("over-allocation accepted: %v", err)
	}
	first.Sold, first.Reserved = 50, 10
}

func TestValidationRejectsContractDriftAndUnsupportedCurrencies(t *testing.T) {
	service, _, actor := setupService()
	for name, mutate := range map[string]func(*EventInput){
		"venue name maximum":  func(input *EventInput) { input.Venue.Name = strings.Repeat("a", 201) },
		"non alpha country":   func(input *EventInput) { input.Venue.CountryCode = "G1" },
		"insecure map":        func(input *EventInput) { input.Venue.MapURL = "http://example.test" },
		"oversized policy":    func(input *EventInput) { input.Policies.AgeGuidance = strings.Repeat("a", 1001) },
		"hidden banner asset": func(input *EventInput) { input.Banner = BannerSchedule{Featured: false} },
	} {
		t.Run(name, func(t *testing.T) {
			input := validEventInput()
			mutate(&input)
			if _, err := service.Create(context.Background(), actor, input); !errors.Is(err, ErrInvalid) {
				t.Fatalf("invalid input accepted: %v", err)
			}
		})
	}
	input := validEventInput()
	event, err := service.Create(context.Background(), actor, input)
	if err != nil {
		t.Fatal(err)
	}
	ticket := validTicketInput()
	ticket.Currency = "ZZZ"
	if _, err = service.CreateTicket(context.Background(), actor, event.PublicID, ticket); !errors.Is(err, ErrInvalid) {
		t.Fatalf("unsupported currency accepted: %v", err)
	}
}

func TestConcurrentTicketCreationCannotOverAllocateCapacity(t *testing.T) {
	service, _, actor := setupService()
	eventInput := validEventInput()
	eventInput.Capacity = 60
	event, _ := service.Create(context.Background(), actor, eventInput)
	start := make(chan struct{})
	results := make(chan error, 2)
	for index := 0; index < 2; index++ {
		go func(order int) {
			<-start
			input := validTicketInput()
			input.Name = fmt.Sprintf("Admission %d", order)
			input.Capacity = 40
			input.SortOrder = order
			_, err := service.CreateTicket(context.Background(), actor, event.PublicID, input)
			results <- err
		}(index)
	}
	close(start)
	first, second := <-results, <-results
	if first == nil && second == nil || first != nil && second != nil {
		t.Fatalf("exactly one allocation must commit: %v / %v", first, second)
	}
}

func TestAuthorizationAuditRollbackAndDerivedTicketStates(t *testing.T) {
	service, store, actor := setupService()
	if _, err := service.Create(context.Background(), Actor{}, validEventInput()); !errors.Is(err, ErrForbidden) {
		t.Fatalf("unauthorized create = %v", err)
	}
	store.FailAudit = true
	if _, err := service.Create(context.Background(), actor, validEventInput()); !errors.Is(err, ErrConflict) {
		t.Fatalf("audit failure = %v", err)
	}
	items, _ := store.List(context.Background())
	if len(items) != 0 {
		t.Fatal("mutation committed without audit")
	}
	for _, test := range []struct {
		now    time.Time
		paused bool
		sold   int
		want   TicketStatus
	}{{testNow, false, 0, TicketScheduled}, {testNow.Add(2 * time.Hour), false, 0, TicketOnSale}, {testNow.Add(2 * time.Hour), true, 0, TicketPaused}, {testNow.Add(2 * time.Hour), false, 60, TicketSoldOut}, {testNow.Add(8 * 24 * time.Hour), false, 0, TicketSaleEnded}} {
		ticket := TicketType{Capacity: 60, Sold: test.sold, Paused: test.paused, SalesStart: testNow.Add(time.Hour), SalesEnd: testNow.Add(7 * 24 * time.Hour)}
		if got := TicketState(ticket, test.now); got != test.want {
			t.Errorf("TicketState() = %s, want %s", got, test.want)
		}
	}
}
