package events

import (
	"context"
	"sort"
	"sync"
	"time"
)

type MemoryStore struct {
	mu        sync.Mutex
	events    map[string]Event
	tickets   map[string]map[string]TicketType
	audits    []AuditEvent
	FailAudit bool
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{events: map[string]Event{}, tickets: map[string]map[string]TicketType{}}
}

func (store *MemoryStore) List(context.Context) ([]Event, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	result := make([]Event, 0, len(store.events))
	for _, event := range store.events {
		result = append(result, event)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].StartsAt.Before(result[j].StartsAt) })
	return result, nil
}

func (store *MemoryStore) FindEvent(_ context.Context, id string) (Event, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	event, ok := store.events[id]
	if !ok {
		return Event{}, ErrNotFound
	}
	return event, nil
}

func (store *MemoryStore) FindBySlug(_ context.Context, slug string) (Event, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, event := range store.events {
		if event.Slug == slug {
			return event, nil
		}
	}
	return Event{}, ErrNotFound
}

func (store *MemoryStore) CreateEvent(_ context.Context, event Event, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	for _, existing := range store.events {
		if existing.Slug == event.Slug {
			return ErrConflict
		}
	}
	if store.FailAudit {
		return ErrConflict
	}
	store.events[event.PublicID] = event
	store.audits = append(store.audits, audit)
	return nil
}

func (store *MemoryStore) UpdateEvent(_ context.Context, event Event, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if _, ok := store.events[event.PublicID]; !ok {
		return ErrNotFound
	}
	if store.FailAudit {
		return ErrConflict
	}
	store.events[event.PublicID] = event
	store.audits = append(store.audits, audit)
	return nil
}

func (store *MemoryStore) TransitionEvent(_ context.Context, id string, from, to EventStatus, at time.Time, audit AuditEvent) (Event, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	event, ok := store.events[id]
	if !ok {
		return Event{}, ErrNotFound
	}
	if event.Status != from || store.FailAudit {
		return Event{}, ErrConflict
	}
	event.Status, event.UpdatedAt = to, at
	if to == EventPublished {
		event.PublishedAt = &at
	}
	if to == EventCancelled {
		event.CancelledAt = &at
	}
	store.events[id] = event
	store.audits = append(store.audits, audit)
	return event, nil
}

func (store *MemoryStore) ListTickets(_ context.Context, eventID string) ([]TicketType, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	result := make([]TicketType, 0, len(store.tickets[eventID]))
	for _, ticket := range store.tickets[eventID] {
		result = append(result, ticket)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].SortOrder < result[j].SortOrder })
	return result, nil
}

func (store *MemoryStore) FindTicket(_ context.Context, eventID, ticketID string) (TicketType, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	ticket, ok := store.tickets[eventID][ticketID]
	if !ok {
		return TicketType{}, ErrNotFound
	}
	return ticket, nil
}

func (store *MemoryStore) CreateTicket(_ context.Context, ticket TicketType, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	event, ok := store.events[ticket.EventID]
	if !ok {
		return ErrNotFound
	}
	allocated := 0
	for _, existing := range store.tickets[ticket.EventID] {
		allocated += existing.Capacity
	}
	if event.Status != EventDraft || allocated+ticket.Capacity > event.Capacity {
		return ErrConflict
	}
	if store.FailAudit {
		return ErrConflict
	}
	if store.tickets[ticket.EventID] == nil {
		store.tickets[ticket.EventID] = map[string]TicketType{}
	}
	store.tickets[ticket.EventID][ticket.PublicID] = ticket
	store.audits = append(store.audits, audit)
	return nil
}

func (store *MemoryStore) UpdateTicket(_ context.Context, ticket TicketType, audit AuditEvent) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if _, ok := store.tickets[ticket.EventID][ticket.PublicID]; !ok {
		return ErrNotFound
	}
	allocated := ticket.Capacity
	for id, existing := range store.tickets[ticket.EventID] {
		if id != ticket.PublicID {
			allocated += existing.Capacity
		}
	}
	if allocated > store.events[ticket.EventID].Capacity || ticket.Sold+ticket.Reserved > ticket.Capacity {
		return ErrConflict
	}
	if store.FailAudit {
		return ErrConflict
	}
	store.tickets[ticket.EventID][ticket.PublicID] = ticket
	store.audits = append(store.audits, audit)
	return nil
}

func (store *MemoryStore) SetTicketPaused(_ context.Context, eventID, ticketID string, paused bool, at time.Time, audit AuditEvent) (TicketType, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	ticket, ok := store.tickets[eventID][ticketID]
	if !ok {
		return TicketType{}, ErrNotFound
	}
	if store.FailAudit {
		return TicketType{}, ErrConflict
	}
	ticket.Paused, ticket.UpdatedAt = paused, at
	ticket.Status = TicketState(ticket, at)
	store.tickets[eventID][ticketID] = ticket
	store.audits = append(store.audits, audit)
	return ticket, nil
}

func (store *MemoryStore) Audits() []AuditEvent {
	store.mu.Lock()
	defer store.mu.Unlock()
	return append([]AuditEvent(nil), store.audits...)
}

var _ Store = (*MemoryStore)(nil)
