package exports

import (
	"context"
	"fmt"
	"time"
)

type Store interface {
	ListEnquiries(context.Context, int) (Result, error)
	ListContacts(context.Context, int) (Result, error)
	ListBookings(context.Context, int) (Result, error)
	ListCampaigns(context.Context, int) (Result, error)
	RecordExport(context.Context, Actor, Resource, int, time.Time) error
}

type Service struct {
	store Store
	now   func() time.Time
}

func NewService(store Store) *Service {
	return &Service{store: store, now: func() time.Time { return time.Now().UTC() }}
}

func (service *Service) Export(ctx context.Context, actor Actor, request Request) (Result, error) {
	if actor.UserID == "" || actor.InternalID == "" {
		return Result{}, ErrForbidden
	}
	normalized, err := request.normalized()
	if err != nil {
		return Result{}, err
	}
	if !allows(actor.Role, normalized.Resource) {
		return Result{}, ErrForbidden
	}
	var result Result
	switch normalized.Resource {
	case ResourceEnquiries:
		result, err = service.store.ListEnquiries(ctx, MaximumRows)
	case ResourceContacts:
		result, err = service.store.ListContacts(ctx, MaximumRows)
	case ResourceBookings:
		result, err = service.store.ListBookings(ctx, MaximumRows)
	case ResourceCampaigns:
		result, err = service.store.ListCampaigns(ctx, MaximumRows)
	default:
		return Result{}, ErrInvalid
	}
	if err != nil {
		return Result{}, err
	}
	if result.Filename == "" {
		result.Filename = fmt.Sprintf("%s.csv", normalized.Resource)
	}
	result.Rows = sanitizeRows(result.Rows)
	if err = service.store.RecordExport(ctx, actor, normalized.Resource, len(result.Rows), service.now()); err != nil {
		return Result{}, ErrUnavailable
	}
	return result, nil
}

func sanitizeRows(rows []Row) []Row {
	out := make([]Row, len(rows))
	for i, row := range rows {
		cells := make(Row, len(row))
		for j, cell := range row {
			cells[j] = safeCell(cell)
		}
		out[i] = cells
	}
	return out
}

func (service *Service) Allowed(actor Actor) ([]Resource, error) {
	if actor.UserID == "" {
		return nil, ErrForbidden
	}
	resources, ok := allowedResources(actor.Role)
	if !ok {
		return nil, ErrForbidden
	}
	return resources, nil
}
