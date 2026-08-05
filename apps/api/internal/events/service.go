package events

import (
	"context"
	"crypto/rand"
	"fmt"
	"strings"
	"time"
)

type Actor struct {
	InternalID string
	CanManage  bool
}

type AuditEvent struct {
	PublicID, ActorID, Action, EntityType, EntityID string
	CreatedAt                                       time.Time
}

type Store interface {
	List(context.Context) ([]Event, error)
	FindEvent(context.Context, string) (Event, error)
	FindBySlug(context.Context, string) (Event, error)
	CreateEvent(context.Context, Event, AuditEvent) error
	UpdateEvent(context.Context, Event, AuditEvent) error
	TransitionEvent(context.Context, string, EventStatus, EventStatus, time.Time, AuditEvent) (Event, error)
	ListTickets(context.Context, string) ([]TicketType, error)
	FindTicket(context.Context, string, string) (TicketType, error)
	CreateTicket(context.Context, TicketType, AuditEvent) error
	UpdateTicket(context.Context, TicketType, AuditEvent) error
	SetTicketPaused(context.Context, string, string, bool, time.Time, AuditEvent) (TicketType, error)
}

type Service struct {
	store Store
	now   func() time.Time
	id    func() (string, error)
}

func NewService(store Store, now func() time.Time, id func() (string, error)) *Service {
	if now == nil {
		now = time.Now
	}
	if id == nil {
		id = UUID
	}
	return &Service{store: store, now: now, id: id}
}

func (service *Service) List(ctx context.Context, actor Actor) ([]Event, error) {
	if !actor.CanManage {
		return nil, ErrForbidden
	}
	return service.store.List(ctx)
}

func (service *Service) Preview(ctx context.Context, actor Actor, id string) (Event, []TicketType, error) {
	if !actor.CanManage {
		return Event{}, nil, ErrForbidden
	}
	event, err := service.store.FindEvent(ctx, id)
	if err != nil {
		return Event{}, nil, err
	}
	tickets, err := service.store.ListTickets(ctx, id)
	for index := range tickets {
		tickets[index].Status = TicketState(tickets[index], service.now().UTC())
	}
	return event, tickets, err
}

func (service *Service) Create(ctx context.Context, actor Actor, input EventInput) (Event, error) {
	if !authorized(actor) {
		return Event{}, ErrForbidden
	}
	input.Normalize()
	if err := input.Validate(); err != nil {
		return Event{}, err
	}
	id, err := service.id()
	if err != nil || !ValidPublicID(id) {
		return Event{}, ErrInvalid
	}
	slug := slugify(input.Title)
	if !ValidSlug(slug) {
		return Event{}, ErrInvalid
	}
	now := service.now().UTC()
	event := Event{PublicID: id, Slug: slug, Title: input.Title, Summary: input.Summary, Description: input.Description, Venue: input.Venue, Policies: input.Policies, StartsAt: input.StartsAt.UTC(), EndsAt: input.EndsAt.UTC(), Timezone: input.Timezone, Capacity: input.Capacity, BannerAssetID: input.BannerAssetID, Banner: input.Banner, Status: EventDraft, CreatedAt: now, UpdatedAt: now}
	if err := service.store.CreateEvent(ctx, event, service.audit(actor, "event.create", "event", id)); err != nil {
		return Event{}, err
	}
	return event, nil
}

func (service *Service) Update(ctx context.Context, actor Actor, id string, input EventInput) (Event, error) {
	if !authorized(actor) {
		return Event{}, ErrForbidden
	}
	input.Normalize()
	if !ValidPublicID(id) || input.Validate() != nil {
		return Event{}, ErrInvalid
	}
	event, err := service.store.FindEvent(ctx, id)
	if err != nil {
		return Event{}, err
	}
	if event.Status == EventCancelled {
		return Event{}, ErrConflict
	}
	tickets, err := service.store.ListTickets(ctx, id)
	if err != nil || ticketCapacity(tickets) > input.Capacity {
		return Event{}, ErrConflict
	}
	event.Title, event.Summary, event.Description = input.Title, input.Summary, input.Description
	event.Venue, event.Policies, event.StartsAt, event.EndsAt, event.Timezone = input.Venue, input.Policies, input.StartsAt.UTC(), input.EndsAt.UTC(), input.Timezone
	event.Capacity, event.BannerAssetID, event.Banner, event.UpdatedAt = input.Capacity, input.BannerAssetID, input.Banner, service.now().UTC()
	if err = service.store.UpdateEvent(ctx, event, service.audit(actor, "event.update", "event", id)); err != nil {
		return Event{}, err
	}
	return event, nil
}

func (service *Service) Publish(ctx context.Context, actor Actor, id string) (Event, error) {
	if !authorized(actor) {
		return Event{}, ErrForbidden
	}
	event, tickets, err := service.Preview(ctx, actor, id)
	if err != nil {
		return Event{}, err
	}
	if event.Status != EventDraft || len(tickets) == 0 || ticketCapacity(tickets) > event.Capacity || !event.EndsAt.After(service.now().UTC()) {
		return Event{}, ErrConflict
	}
	for _, ticket := range tickets {
		if ticket.Sold < 0 || ticket.Reserved < 0 || ticket.Sold+ticket.Reserved > ticket.Capacity {
			return Event{}, ErrConflict
		}
	}
	return service.store.TransitionEvent(ctx, id, EventDraft, EventPublished, service.now().UTC(), service.audit(actor, "event.publish", "event", id))
}

func (service *Service) Cancel(ctx context.Context, actor Actor, id string) (Event, error) {
	if !authorized(actor) {
		return Event{}, ErrForbidden
	}
	return service.store.TransitionEvent(ctx, id, EventPublished, EventCancelled, service.now().UTC(), service.audit(actor, "event.cancel", "event", id))
}

func (service *Service) CreateTicket(ctx context.Context, actor Actor, eventID string, input TicketInput) (TicketType, error) {
	if !authorized(actor) {
		return TicketType{}, ErrForbidden
	}
	event, err := service.store.FindEvent(ctx, eventID)
	if err != nil {
		return TicketType{}, err
	}
	if event.Status != EventDraft {
		return TicketType{}, ErrConflict
	}
	input.Normalize()
	if err = input.Validate(event); err != nil {
		return TicketType{}, err
	}
	tickets, err := service.store.ListTickets(ctx, eventID)
	if err != nil || ticketCapacity(tickets)+input.Capacity > event.Capacity {
		return TicketType{}, ErrConflict
	}
	id, err := service.id()
	if err != nil || !ValidPublicID(id) {
		return TicketType{}, ErrInvalid
	}
	now := service.now().UTC()
	ticket := TicketType{PublicID: id, EventID: eventID, Name: input.Name, Description: input.Description, Price: input.Price, Currency: input.Currency, Capacity: input.Capacity, MinPerOrder: input.MinPerOrder, MaxPerOrder: input.MaxPerOrder, SalesStart: input.SalesStart.UTC(), SalesEnd: input.SalesEnd.UTC(), Status: TicketDraft, SortOrder: input.SortOrder, CreatedAt: now, UpdatedAt: now}
	if err = service.store.CreateTicket(ctx, ticket, service.audit(actor, "ticket_type.create", "ticket_type", id)); err != nil {
		return TicketType{}, err
	}
	return ticket, nil
}

func (service *Service) UpdateTicket(ctx context.Context, actor Actor, eventID, ticketID string, input TicketInput) (TicketType, error) {
	if !authorized(actor) {
		return TicketType{}, ErrForbidden
	}
	event, err := service.store.FindEvent(ctx, eventID)
	if err != nil {
		return TicketType{}, err
	}
	input.Normalize()
	if err = input.Validate(event); err != nil {
		return TicketType{}, err
	}
	ticket, err := service.store.FindTicket(ctx, eventID, ticketID)
	if err != nil {
		return TicketType{}, err
	}
	if input.Capacity < ticket.Sold+ticket.Reserved {
		return TicketType{}, ErrConflict
	}
	tickets, err := service.store.ListTickets(ctx, eventID)
	if err != nil || ticketCapacityExcept(tickets, ticketID)+input.Capacity > event.Capacity {
		return TicketType{}, ErrConflict
	}
	ticket.Name, ticket.Description, ticket.Price, ticket.Currency = input.Name, input.Description, input.Price, input.Currency
	ticket.Capacity, ticket.MinPerOrder, ticket.MaxPerOrder = input.Capacity, input.MinPerOrder, input.MaxPerOrder
	ticket.SalesStart, ticket.SalesEnd, ticket.SortOrder, ticket.UpdatedAt = input.SalesStart.UTC(), input.SalesEnd.UTC(), input.SortOrder, service.now().UTC()
	ticket.Status = TicketState(ticket, service.now().UTC())
	if err = service.store.UpdateTicket(ctx, ticket, service.audit(actor, "ticket_type.update", "ticket_type", ticketID)); err != nil {
		return TicketType{}, err
	}
	return ticket, nil
}

func (service *Service) SetTicketPaused(ctx context.Context, actor Actor, eventID, ticketID string, paused bool) (TicketType, error) {
	if !authorized(actor) {
		return TicketType{}, ErrForbidden
	}
	event, err := service.store.FindEvent(ctx, eventID)
	if err != nil {
		return TicketType{}, err
	}
	if event.Status != EventPublished {
		return TicketType{}, ErrConflict
	}
	action := "ticket_type.resume"
	if paused {
		action = "ticket_type.pause"
	}
	return service.store.SetTicketPaused(ctx, eventID, ticketID, paused, service.now().UTC(), service.audit(actor, action, "ticket_type", ticketID))
}

func authorized(actor Actor) bool { return actor.CanManage && actor.InternalID != "" }

func (service *Service) audit(actor Actor, action, entityType, entityID string) AuditEvent {
	id, _ := service.id()
	return AuditEvent{PublicID: id, ActorID: actor.InternalID, Action: action, EntityType: entityType, EntityID: entityID, CreatedAt: service.now().UTC()}
}

func ticketCapacity(tickets []TicketType) int { return ticketCapacityExcept(tickets, "") }
func ticketCapacityExcept(tickets []TicketType, excluded string) int {
	total := 0
	for _, ticket := range tickets {
		if ticket.PublicID != excluded {
			total += ticket.Capacity
		}
	}
	return total
}

func slugify(value string) string {
	var result strings.Builder
	dash := false
	for _, character := range strings.ToLower(strings.TrimSpace(value)) {
		if character >= 'a' && character <= 'z' || character >= '0' && character <= '9' {
			result.WriteRune(character)
			dash = false
		} else if result.Len() > 0 && !dash {
			result.WriteByte('-')
			dash = true
		}
	}
	return strings.TrimSuffix(result.String(), "-")
}

func UUID() (string, error) {
	data := make([]byte, 16)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	data[6] = data[6]&0x0f | 0x40
	data[8] = data[8]&0x3f | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", data[0:4], data[4:6], data[6:8], data[8:10], data[10:16]), nil
}
