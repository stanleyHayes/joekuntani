package content

import (
	"context"
	"crypto/rand"
	"fmt"
	"time"
)

type Actor struct {
	InternalID, PublicID string
	CanEdit, CanApprove  bool
}
type AuditEvent struct {
	PublicID, ActorID, Action, EntityID string
	CreatedAt                           time.Time
}
type Query struct {
	Kind                     Kind
	Category, Tag            string
	FeaturedOnly, PublicOnly bool
	Now                      time.Time
}
type Store interface {
	List(context.Context, Query) ([]Item, error)
	FindByID(context.Context, string) (Item, error)
	FindBySlug(context.Context, Kind, string) (Item, error)
	Create(context.Context, Item, AuditEvent) error
	Update(context.Context, Item, AuditEvent) error
	Delete(context.Context, Item, AuditEvent) error
}
type Domain struct {
	store Store
	now   func() time.Time
	id    func() (string, error)
}

func NewDomain(store Store, now func() time.Time, id func() (string, error)) *Domain {
	if now == nil {
		now = time.Now
	}
	if id == nil {
		id = UUID
	}
	return &Domain{store: store, now: now, id: id}
}

func (domain *Domain) Public(ctx context.Context, query Query) ([]Item, error) {
	query.PublicOnly = true
	query.Now = domain.now().UTC()
	if !validKind(query.Kind) {
		return nil, ErrInvalid
	}
	return domain.store.List(ctx, query)
}
func (domain *Domain) PublicBySlug(ctx context.Context, kind Kind, slug string) (Item, error) {
	if kind != Page && kind != Portfolio || !slugPattern.MatchString(slug) {
		return Item{}, ErrNotFound
	}
	item, err := domain.store.FindBySlug(ctx, kind, slug)
	if err != nil || !item.PublicAt(domain.now().UTC()) {
		return Item{}, ErrNotFound
	}
	return item, nil
}
func (domain *Domain) All(ctx context.Context, actor Actor, query Query) ([]Item, error) {
	if !actor.CanEdit {
		return nil, ErrForbidden
	}
	if !validKind(query.Kind) {
		return nil, ErrInvalid
	}
	return domain.store.List(ctx, query)
}
func (domain *Domain) Preview(ctx context.Context, actor Actor, id string) (Item, error) {
	if !actor.CanEdit {
		return Item{}, ErrForbidden
	}
	return domain.item(ctx, id)
}
func (domain *Domain) Create(ctx context.Context, actor Actor, input Input) (Item, error) {
	if !actor.CanEdit || actor.InternalID == "" {
		return Item{}, ErrForbidden
	}
	input.Normalize()
	if err := input.Validate(true); err != nil {
		return Item{}, err
	}
	publicID, err := domain.id()
	if err != nil || !ValidID(publicID) {
		return Item{}, ErrInvalid
	}
	now := domain.now().UTC()
	item := Item{PublicID: publicID, Kind: input.Kind, Slug: input.Slug, Title: input.Title, Summary: input.Summary, Body: input.Body, Category: input.Category, Tags: input.Tags, Featured: input.Featured, GalleryAssetIDs: input.GalleryAssetIDs, Results: input.Results, Sections: input.Sections, ExternalURL: input.ExternalURL, EmbedURL: input.EmbedURL, VideoAssetID: input.VideoAssetID, Outlet: input.Outlet, PersonName: input.PersonName, PersonTitle: input.PersonTitle, Organization: input.Organization, SEO: input.SEO, Status: Draft, Revision: 1, CreatedAt: now, UpdatedAt: now}
	if err := domain.store.Create(ctx, item, domain.audit(actor, "content.create", publicID)); err != nil {
		return Item{}, err
	}
	return item, nil
}
func (domain *Domain) Update(ctx context.Context, actor Actor, id string, revision int64, input Input) (Item, error) {
	if !actor.CanEdit || actor.InternalID == "" {
		return Item{}, ErrForbidden
	}
	if !ValidID(id) {
		return Item{}, ErrNotFound
	}
	input.Normalize()
	current, err := domain.store.FindByID(ctx, id)
	if err != nil {
		return Item{}, err
	}
	if revision < 1 || current.Revision != revision {
		return Item{}, ErrConflict
	}
	input.Kind = current.Kind
	input.Slug = ""
	if err = input.Validate(false); err != nil {
		return Item{}, err
	}
	wasPublished := current.Status == Published && current.Approved
	current.Title, current.Summary, current.Body, current.Category = input.Title, input.Summary, input.Body, input.Category
	current.Tags, current.Featured, current.GalleryAssetIDs, current.Results = input.Tags, input.Featured, input.GalleryAssetIDs, input.Results
	// Blocks are replaced wholesale on save: the editor sends the page's
	// full running order, so merging would resurrect deleted blocks.
	current.Sections = input.Sections
	current.ExternalURL, current.EmbedURL, current.VideoAssetID, current.Outlet = input.ExternalURL, input.EmbedURL, input.VideoAssetID, input.Outlet
	current.PersonName, current.PersonTitle, current.Organization = input.PersonName, input.PersonTitle, input.Organization
	current.SEO = input.SEO
	current.UpdatedAt = domain.now().UTC()
	current.Revision++
	current.Approved = wasPublished
	switch current.Status {
	case Draft:
	case Published:
		if wasPublished {
			break
		}
		current.Status = Draft
		current.PublishAt = nil
		current.UnpublishAt = nil
	case Scheduled, Unpublished:
		current.Status = Draft
		current.PublishAt = nil
		current.UnpublishAt = nil
	default:
		return Item{}, ErrInvalid
	}
	if err = domain.store.Update(ctx, current, domain.audit(actor, "content.update", id)); err != nil {
		return Item{}, err
	}
	return current, nil
}
func (domain *Domain) Approve(ctx context.Context, actor Actor, id string, revision int64, approved bool) (Item, error) {
	if !actor.CanApprove || actor.InternalID == "" {
		return Item{}, ErrForbidden
	}
	item, err := domain.item(ctx, id)
	if err != nil {
		return Item{}, err
	}
	if revision < 1 || item.Revision != revision || item.Status != Draft || item.Approved == approved {
		return Item{}, ErrConflict
	}
	item.Approved = approved
	item.UpdatedAt = domain.now().UTC()
	item.Revision++
	if !approved && item.Status != Unpublished {
		item.Status = Draft
		item.PublishAt = nil
		item.UnpublishAt = nil
	}
	action := "content.approval.revoke"
	if approved {
		action = "content.approve"
	}
	if err = domain.store.Update(ctx, item, domain.audit(actor, action, id)); err != nil {
		return Item{}, err
	}
	return item, nil
}
func (domain *Domain) Schedule(ctx context.Context, actor Actor, id string, revision int64, publishAt time.Time, unpublishAt *time.Time) (Item, error) {
	if !actor.CanApprove || actor.InternalID == "" {
		return Item{}, ErrForbidden
	}
	item, err := domain.item(ctx, id)
	if err != nil {
		return Item{}, err
	}
	now := domain.now().UTC()
	publishAt = publishAt.UTC()
	if revision < 1 || item.Revision != revision {
		return Item{}, ErrConflict
	}
	if item.Status != Draft || !item.Approved {
		return Item{}, ErrConflict
	}
	if !publishAt.After(now) || (unpublishAt != nil && !unpublishAt.After(publishAt)) {
		return Item{}, ErrInvalid
	}
	item.Status = Scheduled
	item.PublishAt = &publishAt
	item.UnpublishAt = unpublishAt
	item.UpdatedAt = now
	item.Revision++
	if err = domain.store.Update(ctx, item, domain.audit(actor, "content.schedule", id)); err != nil {
		return Item{}, err
	}
	return item, nil
}
func (domain *Domain) Publish(ctx context.Context, actor Actor, id string, revision int64, unpublishAt *time.Time) (Item, error) {
	if !actor.CanApprove || actor.InternalID == "" {
		return Item{}, ErrForbidden
	}
	item, err := domain.item(ctx, id)
	if err != nil {
		return Item{}, err
	}
	now := domain.now().UTC()
	if revision < 1 || item.Revision != revision {
		return Item{}, ErrConflict
	}
	if !item.Approved || item.Status != Draft && item.Status != Scheduled {
		return Item{}, ErrConflict
	}
	if item.Status == Scheduled && (item.PublishAt == nil || item.PublishAt.After(now)) {
		return Item{}, ErrConflict
	}
	if unpublishAt != nil && !unpublishAt.After(now) {
		return Item{}, ErrInvalid
	}
	publishAt := now
	if item.Status == Scheduled {
		publishAt = *item.PublishAt
	}
	item.Status = Published
	item.PublishAt = &publishAt
	item.PublishedAt = &now
	item.UnpublishAt = unpublishAt
	item.UpdatedAt = now
	item.Revision++
	if err = domain.store.Update(ctx, item, domain.audit(actor, "content.publish", id)); err != nil {
		return Item{}, err
	}
	return item, nil
}
func (domain *Domain) Unpublish(ctx context.Context, actor Actor, id string, revision int64) (Item, error) {
	if !actor.CanApprove || actor.InternalID == "" {
		return Item{}, ErrForbidden
	}
	item, err := domain.item(ctx, id)
	if err != nil {
		return Item{}, err
	}
	if revision < 1 || item.Revision != revision {
		return Item{}, ErrConflict
	}
	if item.Status != Published {
		return Item{}, ErrConflict
	}
	now := domain.now().UTC()
	item.Status = Unpublished
	item.UnpublishAt = &now
	item.UpdatedAt = now
	item.Revision++
	if err = domain.store.Update(ctx, item, domain.audit(actor, "content.unpublish", id)); err != nil {
		return Item{}, err
	}
	return item, nil
}
func (domain *Domain) Delete(ctx context.Context, actor Actor, id string, revision int64) error {
	if !actor.CanApprove || actor.InternalID == "" {
		return ErrForbidden
	}
	item, err := domain.item(ctx, id)
	if err != nil {
		return err
	}
	if revision < 1 || item.Revision != revision {
		return ErrConflict
	}
	if item.Status == Published || item.Status == Scheduled {
		return ErrConflict
	}
	return domain.store.Delete(ctx, item, domain.audit(actor, "content.delete", id))
}
func (domain *Domain) item(ctx context.Context, id string) (Item, error) {
	if !ValidID(id) {
		return Item{}, ErrNotFound
	}
	return domain.store.FindByID(ctx, id)
}
func (domain *Domain) audit(actor Actor, action, id string) AuditEvent {
	eventID, _ := domain.id()
	return AuditEvent{PublicID: eventID, ActorID: actor.InternalID, Action: action, EntityID: id, CreatedAt: domain.now().UTC()}
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
