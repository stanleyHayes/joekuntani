package privacy

import (
	"context"
	"strings"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/crm"
)

type Store interface {
	Status(context.Context, time.Time, time.Time) (Status, error)
	PlaceHold(context.Context, Hold) error
	ClearHold(context.Context, string, time.Time) (Hold, error)
	HasActiveHold(context.Context, string) (bool, error)
	ListActiveHolds(context.Context, int) ([]Hold, error)
	ListEligibleEnquiries(context.Context, time.Time, int) ([]EnquiryCandidate, error)
	PurgeEnquiry(context.Context, EnquiryCandidate, time.Time) error
	RecordAudit(context.Context, string, string, string, string, time.Time) error
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
		id = crm.UUID
	}
	return &Service{store: store, now: now, id: id}
}

// ContactGuard implements crm.RetentionGuard so privacy-delete fails closed on legal hold.
type ContactGuard struct{ store Store }

func NewContactGuard(store Store) ContactGuard { return ContactGuard{store: store} }

func (guard ContactGuard) AssertContactDeletable(ctx context.Context, contactID string) error {
	held, err := guard.store.HasActiveHold(ctx, contactID)
	if err != nil {
		return err
	}
	if held {
		return crm.ErrRetention
	}
	return nil
}

func (service *Service) Status(ctx context.Context, actor Actor) (Status, error) {
	if !canAdminister(actor.Role) || actor.UserID == "" {
		return Status{}, ErrForbidden
	}
	now := service.now().UTC()
	cutoff := now.AddDate(0, -DefaultRetentionMonths, 0)
	status, err := service.store.Status(ctx, now, cutoff)
	if err != nil {
		return Status{}, err
	}
	status.RetentionMonths = DefaultRetentionMonths
	status.GeneratedAt = now
	return status, nil
}

func (service *Service) ListHolds(ctx context.Context, actor Actor) ([]Hold, error) {
	if !canAdminister(actor.Role) || actor.UserID == "" {
		return nil, ErrForbidden
	}
	return service.store.ListActiveHolds(ctx, MaximumBatch)
}

func (service *Service) PlaceHold(ctx context.Context, actor Actor, input HoldInput) (Hold, error) {
	if !canAdminister(actor.Role) || actor.InternalID == "" {
		return Hold{}, ErrForbidden
	}
	normalized, err := input.normalized()
	if err != nil {
		return Hold{}, err
	}
	id, err := service.id()
	if err != nil {
		return Hold{}, ErrUnavailable
	}
	now := service.now().UTC()
	hold := Hold{PublicID: id, ContactID: normalized.ContactID, Reason: normalized.Reason, CreatedAt: now}
	if err = service.store.PlaceHold(ctx, hold); err != nil {
		return Hold{}, err
	}
	_ = service.store.RecordAudit(ctx, actor.InternalID, "privacy.hold.place", "contact", hold.ContactID, now)
	return hold, nil
}

func (service *Service) ClearHold(ctx context.Context, actor Actor, contactID string) (Hold, error) {
	if !canAdminister(actor.Role) || actor.InternalID == "" {
		return Hold{}, ErrForbidden
	}
	contactID = strings.ToLower(strings.TrimSpace(contactID))
	if !validID(contactID) {
		return Hold{}, ErrInvalid
	}
	now := service.now().UTC()
	hold, err := service.store.ClearHold(ctx, contactID, now)
	if err != nil {
		return Hold{}, err
	}
	_ = service.store.RecordAudit(ctx, actor.InternalID, "privacy.hold.clear", "contact", contactID, now)
	return hold, nil
}

func (service *Service) RunRetention(ctx context.Context, actor Actor, limit int) (RetentionResult, error) {
	if !canAdminister(actor.Role) || actor.InternalID == "" {
		return RetentionResult{}, ErrForbidden
	}
	if limit <= 0 {
		limit = 25
	}
	if limit > MaximumBatch {
		return RetentionResult{}, ErrInvalid
	}
	now := service.now().UTC()
	cutoff := now.AddDate(0, -DefaultRetentionMonths, 0)
	candidates, err := service.store.ListEligibleEnquiries(ctx, cutoff, limit)
	if err != nil {
		return RetentionResult{}, err
	}
	result := RetentionResult{CutoffAt: cutoff, Completed: now}
	for _, candidate := range candidates {
		if candidate.ContactID != "" {
			held, holdErr := service.store.HasActiveHold(ctx, candidate.ContactID)
			if holdErr != nil {
				return RetentionResult{}, holdErr
			}
			if held {
				result.Skipped++
				continue
			}
		}
		if err = service.store.PurgeEnquiry(ctx, candidate, now); err != nil {
			return RetentionResult{}, err
		}
		result.Purged++
	}
	_ = service.store.RecordAudit(ctx, actor.InternalID, "privacy.retention.run", "enquiry", "batch", now)
	return result, nil
}
