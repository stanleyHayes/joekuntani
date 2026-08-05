package bookings

import (
	"context"
	"strings"
	"testing"
	"time"
)

type fakeStore struct{ timezone string }

func (fakeStore) Create(context.Context, Booking, string) (Booking, []Warning, error) {
	return Booking{}, nil, nil
}
func (fakeStore) Update(context.Context, string, Input, string, time.Time) (Booking, []Warning, error) {
	return Booking{}, nil, nil
}
func (fakeStore) List(context.Context, Filter) ([]Booking, error)                    { return []Booking{}, nil }
func (fakeStore) SoftDelete(context.Context, string, int64, string, time.Time) error { return nil }
func (f fakeStore) Timezone(context.Context) (string, error)                         { return f.timezone, nil }
func TestListRejectsInvalidTimezoneAndRange(t *testing.T) {
	s := NewService(fakeStore{timezone: "not/a-zone"}, nil)
	actor := Actor{Permissions: map[Permission]bool{Read: true}}
	if _, err := s.List(t.Context(), actor, Filter{From: time.Now(), To: time.Now().Add(time.Hour)}); err != ErrInvalid {
		t.Fatalf("timezone=%v", err)
	}
	s = NewService(fakeStore{timezone: "Africa/Accra"}, nil)
	if _, err := s.List(t.Context(), actor, Filter{From: time.Now(), To: time.Now().Add(371 * 24 * time.Hour)}); err != ErrInvalid {
		t.Fatalf("range=%v", err)
	}
}
func TestICalEscapesContentAndOmitsCancelled(t *testing.T) {
	start := time.Date(2026, 8, 5, 10, 0, 0, 0, time.UTC)
	store := calendarStore{fakeStore: fakeStore{timezone: "Africa/Accra"}, items: []Booking{{ID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", Title: "Show, Live", StartAt: start, EndAt: start.Add(time.Hour), Status: Confirmed, UpdatedAt: start}, {ID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c202", Title: "Cancelled", StartAt: start, EndAt: start.Add(time.Hour), Status: Cancelled, UpdatedAt: start}}}
	s := NewService(store, nil)
	ics, err := s.ICal(t.Context(), Actor{Permissions: map[Permission]bool{Read: true}}, Filter{From: start.Add(-time.Hour), To: start.Add(2 * time.Hour)})
	if err != nil || !strings.Contains(ics, "SUMMARY:Show\\, Live") || strings.Contains(ics, "Cancelled") {
		t.Fatalf("ics=%q err=%v", ics, err)
	}
}

type calendarStore struct {
	fakeStore
	items []Booking
}

func (c calendarStore) List(context.Context, Filter) ([]Booking, error) { return c.items, nil }
