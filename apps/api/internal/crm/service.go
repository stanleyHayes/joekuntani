package crm

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"
	"time"
)

type Permission string

const (
	PermissionRead          Permission = "crm.read"
	PermissionWrite         Permission = "crm.write"
	PermissionAssign        Permission = "crm.assign"
	PermissionPrivacyExport Permission = "crm.privacy.export"
	PermissionPrivacyDelete Permission = "crm.privacy.delete"
)

type Actor struct {
	InternalID  string
	Permissions map[Permission]bool
}

func (service *Service) LookupOrganization(ctx context.Context, actor Actor, name string) (Organization, error) {
	if !actor.Allows(PermissionRead) {
		return Organization{}, ErrForbidden
	}
	normalized := normalizeOrganizationName(name)
	if !bounded(normalized, 2, 160) {
		return Organization{}, ErrInvalid
	}
	return service.store.FindOrganizationByNormalizedName(ctx, normalized)
}

func (actor Actor) Allows(permission Permission) bool {
	return actor.InternalID != "" && actor.Permissions[permission]
}

type AuditEvent struct {
	PublicID, ActorID, Action, EntityType, EntityID string
	CreatedAt                                       time.Time
}

type Store interface {
	CreateOrganization(context.Context, Organization, AuditEvent) error
	FindOrganizationByNormalizedName(context.Context, string) (Organization, error)
	SoftDeleteOrganization(context.Context, string, time.Time, AuditEvent) error
	CreateContact(context.Context, Contact, AuditEvent) error
	SoftDeleteContact(context.Context, string, time.Time, AuditEvent) error
	FindContact(context.Context, string) (Contact, error)
	FindContactByLookup(context.Context, string, string) (Contact, error)
	ResolveSourceEnquiry(context.Context, string) (SourceEnquiry, error)
	CreateEnquiry(context.Context, Enquiry, AuditEvent) error
	ListEnquiries(context.Context, EnquiryFilter) ([]Enquiry, error)
	UpdateEnquiry(context.Context, string, func(*Enquiry) error, AuditEvent) (Enquiry, error)
	SaveView(context.Context, SavedView, AuditEvent) error
	ListViews(context.Context, string) ([]SavedView, error)
	PrivacyExport(context.Context, string, AuditEvent) (Contact, *Organization, []Enquiry, error)
	PrivacyDelete(context.Context, string, time.Time, AuditEvent) (PrivacyDeleteResult, error)
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

func (service *Service) CreateOrganization(ctx context.Context, actor Actor, input OrganizationInput) (Organization, error) {
	if !actor.Allows(PermissionWrite) {
		return Organization{}, ErrForbidden
	}
	input.normalize()
	if err := input.validate(); err != nil {
		return Organization{}, err
	}
	if _, err := service.store.FindOrganizationByNormalizedName(ctx, normalizeOrganizationName(input.Name)); err == nil {
		return Organization{}, ErrConflict
	} else if !errors.Is(err, ErrNotFound) {
		return Organization{}, err
	}
	id, err := service.newID()
	if err != nil {
		return Organization{}, err
	}
	now := service.now().UTC()
	item := Organization{PublicID: id, Name: input.Name, Website: input.Website, CountryCode: input.CountryCode, NormalizedName: normalizeOrganizationName(input.Name), CreatedAt: now, UpdatedAt: now}
	if err = service.store.CreateOrganization(ctx, item, service.audit(actor, "organization.create", "organization", id)); err != nil {
		return Organization{}, err
	}
	return item, nil
}
func (service *Service) CreateContact(ctx context.Context, actor Actor, input ContactInput) (Contact, error) {
	if !actor.Allows(PermissionWrite) {
		return Contact{}, ErrForbidden
	}
	input.normalize()
	if err := input.validate(); err != nil {
		return Contact{}, err
	}
	if found, err := service.store.FindContactByLookup(ctx, input.Email, input.Phone); err == nil {
		return found, ErrConflict
	} else if err != ErrNotFound {
		return Contact{}, err
	}
	id, err := service.newID()
	if err != nil {
		return Contact{}, err
	}
	now := service.now().UTC()
	item := Contact{PublicID: id, OrganizationID: input.OrganizationID, Name: input.Name, Email: input.Email, Phone: input.Phone, Role: input.Role, CountryCode: input.CountryCode, NormalizedEmail: input.Email, NormalizedPhone: input.Phone, CreatedAt: now, UpdatedAt: now}
	if err = service.store.CreateContact(ctx, item, service.audit(actor, "contact.create", "contact", id)); err != nil {
		return Contact{}, err
	}
	return item, nil
}

func (service *Service) SoftDeleteOrganization(ctx context.Context, actor Actor, id string) error {
	if !actor.Allows(PermissionWrite) {
		return ErrForbidden
	}
	if !validID(id) {
		return ErrInvalid
	}
	return service.store.SoftDeleteOrganization(ctx, id, service.now().UTC(), service.audit(actor, "organization.soft_delete", "organization", id))
}

func (service *Service) SoftDeleteContact(ctx context.Context, actor Actor, id string) error {
	if !actor.Allows(PermissionWrite) {
		return ErrForbidden
	}
	if !validID(id) {
		return ErrInvalid
	}
	return service.store.SoftDeleteContact(ctx, id, service.now().UTC(), service.audit(actor, "contact.soft_delete", "contact", id))
}
func (service *Service) LookupContact(ctx context.Context, actor Actor, email, phone string) (Contact, error) {
	if !actor.Allows(PermissionRead) {
		return Contact{}, ErrForbidden
	}
	return service.store.FindContactByLookup(ctx, normalizeEmail(email), normalizePhone(phone))
}
func (service *Service) CreateEnquiry(ctx context.Context, actor Actor, input EnquiryInput) (Enquiry, error) {
	if !actor.Allows(PermissionWrite) {
		return Enquiry{}, ErrForbidden
	}
	input.normalize()
	if err := input.validate(); err != nil {
		return Enquiry{}, err
	}
	if input.OwnerID != "" && !actor.Allows(PermissionAssign) {
		return Enquiry{}, ErrForbidden
	}
	source, err := service.store.ResolveSourceEnquiry(ctx, input.SourceEnquiryID)
	if err != nil {
		return Enquiry{}, err
	}
	id, err := service.newID()
	if err != nil {
		return Enquiry{}, err
	}
	now := service.now().UTC()
	item := Enquiry{PublicID: id, SourceEnquiryID: source.PublicID, Reference: source.Reference, ContactID: input.ContactID, OrganizationID: input.OrganizationID, ServiceID: source.ServiceID, OwnerID: input.OwnerID, Stage: StageNew, Source: source.Source, EnquiryType: source.EnquiryType, Summary: input.Summary, CreatedAt: now, UpdatedAt: now}
	if err = service.store.CreateEnquiry(ctx, item, service.audit(actor, "enquiry.create", "enquiry", id)); err != nil {
		return Enquiry{}, err
	}
	return item, nil
}
func (service *Service) ListEnquiries(ctx context.Context, actor Actor, filter EnquiryFilter) ([]Enquiry, error) {
	if !actor.Allows(PermissionRead) {
		return nil, ErrForbidden
	}
	for _, s := range filter.Stages {
		if !validStage(s) {
			return nil, ErrInvalid
		}
	}
	filter.Query = strings.TrimSpace(filter.Query)
	if len(filter.Query) > 200 {
		return nil, ErrInvalid
	}
	return service.store.ListEnquiries(ctx, filter)
}
func (service *Service) Assign(ctx context.Context, actor Actor, id, ownerID string) (Enquiry, error) {
	if !actor.Allows(PermissionAssign) {
		return Enquiry{}, ErrForbidden
	}
	if !validID(ownerID) {
		return Enquiry{}, ErrInvalid
	}
	return service.update(ctx, actor, id, "enquiry.assign", func(e *Enquiry) error { e.OwnerID = ownerID; return nil })
}
func (service *Service) SetStage(ctx context.Context, actor Actor, id string, stage Stage) (Enquiry, error) {
	if !actor.Allows(PermissionWrite) {
		return Enquiry{}, ErrForbidden
	}
	if !validStage(stage) {
		return Enquiry{}, ErrInvalid
	}
	return service.update(ctx, actor, id, "enquiry.stage", func(e *Enquiry) error {
		if !allowedTransition(e.Stage, stage) {
			return ErrConflict
		}
		e.Stage = stage
		return nil
	})
}
func (service *Service) SoftDeleteEnquiry(ctx context.Context, actor Actor, id string) (Enquiry, error) {
	if !actor.Allows(PermissionWrite) {
		return Enquiry{}, ErrForbidden
	}
	return service.update(ctx, actor, id, "enquiry.soft_delete", func(e *Enquiry) error {
		if e.DeletedAt != nil {
			return ErrConflict
		}
		now := service.now().UTC()
		e.DeletedAt = &now
		return nil
	})
}
func (service *Service) SaveView(ctx context.Context, actor Actor, name string, filter EnquiryFilter) (SavedView, error) {
	if !actor.Allows(PermissionRead) {
		return SavedView{}, ErrForbidden
	}
	name = strings.TrimSpace(name)
	if !bounded(name, 1, 120) {
		return SavedView{}, ErrInvalid
	}
	if _, err := service.ListEnquiries(ctx, actor, filter); err != nil {
		return SavedView{}, err
	}
	id, err := service.newID()
	if err != nil {
		return SavedView{}, err
	}
	now := service.now().UTC()
	v := SavedView{PublicID: id, OwnerID: actor.InternalID, Name: name, Filter: filter, CreatedAt: now, UpdatedAt: now}
	if err = service.store.SaveView(ctx, v, service.audit(actor, "saved_view.create", "saved_view", id)); err != nil {
		return SavedView{}, err
	}
	return v, nil
}
func (service *Service) ListViews(ctx context.Context, actor Actor) ([]SavedView, error) {
	if !actor.Allows(PermissionRead) {
		return nil, ErrForbidden
	}
	return service.store.ListViews(ctx, actor.InternalID)
}
func (service *Service) PrivacyExport(ctx context.Context, actor Actor, contactID string) (PrivacyExport, error) {
	if !actor.Allows(PermissionPrivacyExport) {
		return PrivacyExport{}, ErrForbidden
	}
	if !validID(contactID) {
		return PrivacyExport{}, ErrInvalid
	}
	contact, org, enquiries, err := service.store.PrivacyExport(ctx, contactID, service.audit(actor, "privacy.export", "contact", contactID))
	if err != nil {
		return PrivacyExport{}, err
	}
	return PrivacyExport{Contact: contact, Organization: org, Enquiries: enquiries, ExportedAt: service.now().UTC()}, nil
}
func (service *Service) PrivacyDelete(ctx context.Context, actor Actor, contactID string) (PrivacyDeleteResult, error) {
	if !actor.Allows(PermissionPrivacyDelete) {
		return PrivacyDeleteResult{}, ErrForbidden
	}
	if !validID(contactID) {
		return PrivacyDeleteResult{}, ErrInvalid
	}
	return service.store.PrivacyDelete(ctx, contactID, service.now().UTC(), service.audit(actor, "privacy.delete", "contact", contactID))
}
func (service *Service) update(ctx context.Context, actor Actor, id, action string, fn func(*Enquiry) error) (Enquiry, error) {
	if !validID(id) {
		return Enquiry{}, ErrInvalid
	}
	return service.store.UpdateEnquiry(ctx, id, func(e *Enquiry) error {
		if e.DeletedAt != nil {
			return ErrNotFound
		}
		if err := fn(e); err != nil {
			return err
		}
		e.UpdatedAt = service.now().UTC()
		return nil
	}, service.audit(actor, action, "enquiry", id))
}
func allowedTransition(from, to Stage) bool {
	if from == to {
		return true
	}
	switch from {
	case StageNew:
		return to == StageReviewing
	case StageReviewing:
		return to == StageQualified
	case StageQualified:
		return to == StageCallScheduled
	case StageCallScheduled:
		return to == StageProposalSent
	case StageProposalSent:
		return to == StageNegotiation
	case StageNegotiation:
		return to == StageWon || to == StageLost
	case StageWon, StageLost:
		return to == StageArchived
	}
	return false
}
func (service *Service) newID() (string, error) {
	id, err := service.id()
	if err != nil || !validID(id) {
		return "", ErrInvalid
	}
	return id, nil
}
func (service *Service) audit(actor Actor, action, typ, id string) AuditEvent {
	auditID, _ := service.id()
	return AuditEvent{PublicID: auditID, ActorID: actor.InternalID, Action: action, EntityType: typ, EntityID: id, CreatedAt: service.now().UTC()}
}
func UUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
