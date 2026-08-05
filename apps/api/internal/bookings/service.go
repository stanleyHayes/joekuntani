package bookings

import (
	"context"
	"strings"
	"time"
)

type Store interface {
	Create(context.Context, Booking, string) (Booking, []Warning, error)
	Update(context.Context, string, Input, string, time.Time) (Booking, []Warning, error)
	List(context.Context, Filter) ([]Booking, error)
	SoftDelete(context.Context, string, int64, string, time.Time) error
	Timezone(context.Context) (string, error)
}
type Telemetry interface {
	Created(Status)
	StatusChanged(Status)
}
type noopTelemetry struct{}

func (noopTelemetry) Created(Status)       {}
func (noopTelemetry) StatusChanged(Status) {}

type Service struct {
	store     Store
	telemetry Telemetry
	now       func() time.Time
	id        func() (string, error)
}

func NewService(store Store, telemetry Telemetry) *Service {
	if telemetry == nil {
		telemetry = noopTelemetry{}
	}
	return &Service{store: store, telemetry: telemetry, now: time.Now, id: uuid}
}
func (s *Service) Create(ctx context.Context, actor Actor, input Input) (Result, error) {
	if !actor.Permissions[Write] {
		return Result{}, ErrForbidden
	}
	if input.validate(true) != nil {
		return Result{}, ErrInvalid
	}
	now := s.now().UTC()
	id, err := s.id()
	if err != nil {
		return Result{}, err
	}
	item := Booking{ID: id, EnquiryID: input.EnquiryID, Title: strings.TrimSpace(input.Title), ServiceID: input.ServiceID, Venue: strings.TrimSpace(input.Venue), City: strings.TrimSpace(input.City), Country: input.Country, StartAt: input.StartAt.UTC(), EndAt: input.EndAt.UTC(), Status: input.Status, Fee: input.Fee, Currency: input.Currency, Requirements: input.Requirements, Version: 1, CreatedAt: now, UpdatedAt: now}
	item, warnings, err := s.store.Create(ctx, item, actor.InternalID)
	if err == nil {
		s.telemetry.Created(item.Status)
	}
	return Result{Booking: item, Warnings: warnings}, err
}
func (s *Service) Update(ctx context.Context, actor Actor, id string, input Input) (Result, error) {
	if !actor.Permissions[Write] {
		return Result{}, ErrForbidden
	}
	if !uuidPattern.MatchString(id) || input.Version < 1 || input.validate(false) != nil {
		return Result{}, ErrInvalid
	}
	item, warnings, err := s.store.Update(ctx, id, input, actor.InternalID, s.now().UTC())
	if err == nil {
		s.telemetry.StatusChanged(item.Status)
	}
	return Result{Booking: item, Warnings: warnings}, err
}
func (s *Service) List(ctx context.Context, actor Actor, f Filter) (Calendar, error) {
	if !actor.Permissions[Read] {
		return Calendar{}, ErrForbidden
	}
	if f.From.IsZero() || f.To.IsZero() || !f.From.Before(f.To) || f.To.Sub(f.From) > 370*24*time.Hour {
		return Calendar{}, ErrInvalid
	}
	items, err := s.store.List(ctx, f)
	if err != nil {
		return Calendar{}, err
	}
	tz, err := s.store.Timezone(ctx)
	if err != nil {
		return Calendar{}, err
	}
	if _, err = time.LoadLocation(tz); err != nil {
		return Calendar{}, ErrInvalid
	}
	return Calendar{Items: items, Timezone: tz}, nil
}
func (s *Service) Delete(ctx context.Context, actor Actor, id string, version int64) error {
	if !actor.Permissions[Write] {
		return ErrForbidden
	}
	if !uuidPattern.MatchString(id) || version < 1 {
		return ErrInvalid
	}
	return s.store.SoftDelete(ctx, id, version, actor.InternalID, s.now().UTC())
}
func (s *Service) ICal(ctx context.Context, actor Actor, f Filter) (string, error) {
	cal, err := s.List(ctx, actor, f)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Joe Kuntani//Bookings//EN\r\nX-WR-TIMEZONE:" + escapeICS(cal.Timezone) + "\r\n")
	for _, v := range cal.Items {
		if v.Status == Cancelled {
			continue
		}
		b.WriteString("BEGIN:VEVENT\r\nUID:" + v.ID + "@joekuntani\r\nDTSTAMP:" + v.UpdatedAt.UTC().Format("20060102T150405Z") + "\r\nDTSTART:" + v.StartAt.UTC().Format("20060102T150405Z") + "\r\nDTEND:" + v.EndAt.UTC().Format("20060102T150405Z") + "\r\nSUMMARY:" + escapeICS(v.Title) + "\r\nLOCATION:" + escapeICS(strings.Join([]string{v.Venue, v.City, v.Country}, ", ")) + "\r\nSTATUS:" + map[Status]string{Tentative: "TENTATIVE", Confirmed: "CONFIRMED"}[v.Status] + "\r\nEND:VEVENT\r\n")
	}
	b.WriteString("END:VCALENDAR\r\n")
	return b.String(), nil
}
func escapeICS(v string) string {
	r := strings.NewReplacer("\\", "\\\\", ";", "\\;", ",", "\\,", "\r", "", "\n", "\\n")
	return r.Replace(v)
}
