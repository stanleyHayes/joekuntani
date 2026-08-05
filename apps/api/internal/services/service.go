package services

import (
	"context"
	"crypto/rand"
	"fmt"
	"time"
)

type Actor struct {
	InternalID string
	PublicID   string
	CanEdit    bool
}

type AuditEvent struct {
	PublicID, ActorID, Action, EntityID string
	CreatedAt                           time.Time
}

type Store interface {
	List(context.Context, bool) ([]Service, error)
	FindBySlug(context.Context, string) (Service, error)
	FindByID(context.Context, string) (Service, error)
	Create(context.Context, Service, AuditEvent) error
	Update(context.Context, Service, int64, AuditEvent) error
	SetActive(context.Context, string, bool, int64, time.Time, AuditEvent) error
	Retire(context.Context, string, int64, time.Time, AuditEvent) (Service, error)
	Reorder(context.Context, []OrderItem, time.Time, AuditEvent) error
}

type Clock func() time.Time
type IDGenerator func() (string, error)

type Domain struct {
	store Store
	now   Clock
	id    IDGenerator
}

func NewDomain(store Store, now Clock, id IDGenerator) *Domain {
	if now == nil {
		now = time.Now
	}
	if id == nil {
		id = UUID
	}
	return &Domain{store: store, now: now, id: id}
}

func (domain *Domain) Public(ctx context.Context) ([]Service, error) {
	return domain.store.List(ctx, true)
}

func (domain *Domain) All(ctx context.Context, actor Actor) ([]Service, error) {
	if !actor.CanEdit {
		return nil, ErrForbidden
	}
	return domain.store.List(ctx, false)
}

func (domain *Domain) BySlug(ctx context.Context, slug string) (Service, error) {
	if !ValidSlug(slug) {
		return Service{}, ErrNotFound
	}
	result, err := domain.store.FindBySlug(ctx, slug)
	if err != nil || !result.Active {
		return Service{}, ErrNotFound
	}
	return result, nil
}

func (domain *Domain) Create(ctx context.Context, actor Actor, input Input) (Service, error) {
	if !actor.CanEdit || actor.InternalID == "" {
		return Service{}, ErrForbidden
	}
	input.Normalize()
	if err := input.Validate(); err != nil {
		return Service{}, err
	}
	slug := Slugify(input.Name)
	if !ValidSlug(slug) {
		return Service{}, ErrInvalid
	}
	publicID, err := domain.id()
	if err != nil || !ValidPublicID(publicID) {
		return Service{}, ErrInvalid
	}
	now := domain.now().UTC()
	result := Service{PublicID: publicID, Name: input.Name, Slug: slug, Summary: input.Summary, Description: input.Description, Category: input.Category, Active: input.Active, Version: 1, SortOrder: input.SortOrder, FormSchema: input.FormSchema, CTA: input.CTA, CreatedAt: now, UpdatedAt: now}
	if err := domain.store.Create(ctx, result, domain.audit(actor, "service.create", publicID)); err != nil {
		return Service{}, err
	}
	return result, nil
}

func (domain *Domain) Update(ctx context.Context, actor Actor, id string, expectedVersion int64, input Input) (Service, error) {
	if !actor.CanEdit || actor.InternalID == "" {
		return Service{}, ErrForbidden
	}
	if !ValidPublicID(id) {
		return Service{}, ErrNotFound
	}
	input.Normalize()
	if err := input.Validate(); err != nil {
		return Service{}, err
	}
	current, err := domain.store.FindByID(ctx, id)
	if err != nil {
		return Service{}, err
	}
	if current.RetiredAt != nil || expectedVersion < 1 || current.Version != expectedVersion {
		return Service{}, ErrConflict
	}
	current.Name, current.Summary, current.Description, current.Category = input.Name, input.Summary, input.Description, input.Category
	current.Active, current.SortOrder, current.FormSchema, current.CTA = input.Active, input.SortOrder, input.FormSchema, input.CTA
	current.UpdatedAt = domain.now().UTC()
	if err := domain.store.Update(ctx, current, expectedVersion, domain.audit(actor, "service.update", id)); err != nil {
		return Service{}, err
	}
	current.Version++
	return current, nil
}

func (domain *Domain) SetActive(ctx context.Context, actor Actor, id string, active bool, expectedVersion int64) error {
	if !actor.CanEdit || actor.InternalID == "" {
		return ErrForbidden
	}
	if !ValidPublicID(id) {
		return ErrNotFound
	}
	action := "service.deactivate"
	if active {
		action = "service.activate"
	}
	if expectedVersion < 1 {
		return ErrInvalid
	}
	return domain.store.SetActive(ctx, id, active, expectedVersion, domain.now().UTC(), domain.audit(actor, action, id))
}

func (domain *Domain) Retire(ctx context.Context, actor Actor, id string, expectedVersion int64) (Service, error) {
	if !actor.CanEdit || actor.InternalID == "" {
		return Service{}, ErrForbidden
	}
	if !ValidPublicID(id) {
		return Service{}, ErrNotFound
	}
	if expectedVersion < 1 {
		return Service{}, ErrInvalid
	}
	return domain.store.Retire(ctx, id, expectedVersion, domain.now().UTC(), domain.audit(actor, "service.retire", id))
}

func (domain *Domain) Reorder(ctx context.Context, actor Actor, items []OrderItem) error {
	if !actor.CanEdit || actor.InternalID == "" {
		return ErrForbidden
	}
	if len(items) == 0 || len(items) > 100 {
		return ErrInvalid
	}
	seen := map[string]bool{}
	for _, item := range items {
		if !ValidPublicID(item.ID) || item.Version < 1 || seen[item.ID] {
			return ErrInvalid
		}
		seen[item.ID] = true
	}
	return domain.store.Reorder(ctx, items, domain.now().UTC(), domain.audit(actor, "service.reorder", "services"))
}

func (domain *Domain) audit(actor Actor, action, entity string) AuditEvent {
	publicID, _ := domain.id()
	return AuditEvent{PublicID: publicID, ActorID: actor.InternalID, Action: action, EntityID: entity, CreatedAt: domain.now().UTC()}
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
