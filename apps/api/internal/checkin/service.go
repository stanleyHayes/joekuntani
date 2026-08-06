package checkin

import (
	"context"
	"time"
)

type Store interface {
	Scan(context.Context, Actor, ScanInput, time.Time) (ScanResult, error)
	CountCheckedIn(context.Context, string) (int64, error)
}

type Service struct {
	store Store
	now   func() time.Time
}

func NewService(store Store) *Service {
	return &Service{store: store, now: time.Now}
}

func (s *Service) Scan(ctx context.Context, actor Actor, input ScanInput) (ScanResult, error) {
	normalized, err := input.normalized()
	if err != nil {
		return ScanResult{}, err
	}
	if actor.InternalID == "" {
		return ScanResult{}, ErrForbidden
	}
	return s.store.Scan(ctx, actor, normalized, s.now().UTC())
}

func (s *Service) Count(ctx context.Context, actor Actor, eventID string) (Count, error) {
	if actor.InternalID == "" {
		return Count{}, ErrForbidden
	}
	eventID = trimUUID(eventID)
	if eventID == "" {
		return Count{}, ErrInvalid
	}
	count, err := s.store.CountCheckedIn(ctx, eventID)
	if err != nil {
		return Count{}, err
	}
	return Count{EventID: eventID, CheckedInCount: count}, nil
}

func trimUUID(value string) string {
	if !uuidPattern.MatchString(value) {
		return ""
	}
	return value
}
