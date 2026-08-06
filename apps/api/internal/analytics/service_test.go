package analytics

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

func TestTrackAllowlistAndPrivacyRejects(t *testing.T) {
	t.Parallel()
	store := &MemoryStore{}
	sink := &RecordingSink{}
	service := NewService(store, sink, func() (string, error) { return "10000000-0000-4000-8000-000000000001", nil })

	event, err := service.Track(t.Context(), TrackInput{Name: EventBookingSubmitted, Properties: map[string]string{"reference": "ENQ-1", "enquiry_type": "booking", "source": "web"}})
	if err != nil || event.PublicID == "" || len(sink.Events) != 1 {
		t.Fatalf("track failed %#v err=%v sink=%d", event, err, len(sink.Events))
	}

	if _, err = service.Track(t.Context(), TrackInput{Name: EventBookingSubmitted, Properties: map[string]string{"email": "a@b.c"}}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("pii key: %v", err)
	}
	if _, err = service.Track(t.Context(), TrackInput{Name: EventServiceViewed, Properties: map[string]string{"service_slug": "host@evil"}}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("email-shaped value: %v", err)
	}
	if _, err = service.Track(t.Context(), TrackInput{Name: "unknown_event"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("unknown: %v", err)
	}

	internal, err := service.Track(t.Context(), TrackInput{Name: EventAdminStageChanged, Properties: map[string]string{"from": "new", "to": "won", "enquiry_id": "10000000-0000-4000-8000-000000000099"}})
	if err != nil || !internal.Internal || len(sink.Events) != 1 {
		t.Fatalf("internal must skip sink: %#v err=%v sink=%d", internal, err, len(sink.Events))
	}
}

func TestOverviewRequiresDashboardPermission(t *testing.T) {
	t.Parallel()
	store := &MemoryStore{
		Pipeline:  map[string]int{"new": 2},
		Bookings:  map[string]int{"confirmed": 1},
		Campaigns: map[string]int{"active": 1},
		Content:   3,
		Audience:  []AudienceMetric{{Platform: "instagram", MetricDate: "2026-08-01", Followers: 10}},
	}
	service := NewService(store, nil, func() (string, error) { return "10000000-0000-4000-8000-000000000002", nil })
	_, _ = service.Track(t.Context(), TrackInput{Name: EventPageView, Properties: map[string]string{"path": "/services"}, OccurredAt: time.Now().UTC()})

	if _, err := service.Overview(t.Context(), Actor{UserID: "x", Role: auth.RoleContentEditor}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editor overview: %v", err)
	}
	overview, err := service.Overview(t.Context(), Actor{UserID: "analyst", Role: auth.RoleAnalyst})
	if err != nil || overview.ContentPublished != 3 || overview.Pipeline["new"] != 2 {
		t.Fatalf("overview %#v err=%v", overview, err)
	}
}

func TestHandlerBoundaries(t *testing.T) {
	t.Parallel()
	store := &MemoryStore{Pipeline: map[string]int{}, Bookings: map[string]int{}, Campaigns: map[string]int{}}
	handler := NewHandler(NewService(store, nil, func() (string, error) { return "10000000-0000-4000-8000-000000000003", nil }), func(*http.Request) (Actor, error) {
		return Actor{UserID: "analyst", Role: auth.RoleAnalyst}, nil
	})

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/analytics/overview", nil))
	if recorder.Code != http.StatusOK || recorder.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("overview code=%d cache=%s", recorder.Code, recorder.Header().Get("Cache-Control"))
	}

	public := handler.PublicTrack()
	recorder = httptest.NewRecorder()
	public.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/public/analytics/events", strings.NewReader(`{"name":"service_viewed","properties":{"service_slug":"hosting"}}`)))
	if recorder.Code != http.StatusCreated {
		t.Fatalf("public track=%d body=%s", recorder.Code, recorder.Body.String())
	}

	recorder = httptest.NewRecorder()
	public.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/public/analytics/events", strings.NewReader(`{"name":"admin_stage_changed","properties":{"from":"new","to":"won","enquiry_id":"10000000-0000-4000-8000-000000000099"}}`)))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("internal via public=%d", recorder.Code)
	}

	recorder = httptest.NewRecorder()
	public.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/public/analytics/events", strings.NewReader(`{"name":"service_viewed","properties":{"service_slug":"x"}}{"extra":true}`)))
	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("trailing json=%d", recorder.Code)
	}
}
