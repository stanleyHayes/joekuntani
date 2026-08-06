package privacy

import (
	"bytes"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/analytics"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/crm"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/enquiries"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/observability"
)

func TestConsentAndIPHashExpectations(t *testing.T) {
	t.Parallel()
	if enquiries.ConsentVersionCurrent == "" || enquiries.ConsentTextCurrent == "" {
		t.Fatal("consent version/text must be configured")
	}
	if DefaultRetentionMonths != 24 {
		t.Fatalf("retention months = %d", DefaultRetentionMonths)
	}
}

func TestHoldBlocksDeleteAndRetentionSkips(t *testing.T) {
	t.Parallel()
	store := NewMemoryStore()
	fixed := time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC)
	service := NewService(store, func() time.Time { return fixed }, func() (string, error) {
		return "10000000-0000-4000-8000-000000000001", nil
	})
	admin := Actor{UserID: "admin", InternalID: "aaaaaaaaaaaaaaaaaaaaaaaa", Role: auth.RoleAdministrator}
	contactID := "20000000-0000-4000-8000-000000000002"
	hold, err := service.PlaceHold(t.Context(), admin, HoldInput{ContactID: contactID, Reason: "Litigation hold for active dispute"})
	if err != nil || hold.ContactID != contactID {
		t.Fatalf("place hold: %#v err=%v", hold, err)
	}
	guard := NewContactGuard(store)
	if err = guard.AssertContactDeletable(t.Context(), contactID); !errors.Is(err, crm.ErrRetention) {
		t.Fatalf("guard: %v", err)
	}
	store.Enquiries = []EnquiryCandidate{{
		PublicID:  "30000000-0000-4000-8000-000000000003",
		ContactID: contactID,
		Email:     "person@example.invalid",
		UpdatedAt: fixed.AddDate(0, -25, 0),
	}, {
		PublicID:  "30000000-0000-4000-8000-000000000004",
		Email:     "other@example.invalid",
		UpdatedAt: fixed.AddDate(0, -25, 0),
	}}
	result, err := service.RunRetention(t.Context(), admin, 10)
	if err != nil || result.Purged != 1 || result.Skipped != 1 {
		t.Fatalf("retention %#v err=%v", result, err)
	}
	if store.Enquiries[0].Email != "person@example.invalid" || store.Enquiries[1].Email != anonymizedEmail {
		t.Fatalf("purge state %#v", store.Enquiries)
	}
	if _, err = service.ClearHold(t.Context(), admin, contactID); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if err = guard.AssertContactDeletable(t.Context(), contactID); err != nil {
		t.Fatalf("after clear: %v", err)
	}
}

func TestAnalystForbidden(t *testing.T) {
	t.Parallel()
	service := NewService(NewMemoryStore(), nil, nil)
	analyst := Actor{UserID: "a", InternalID: "bbbbbbbbbbbbbbbbbbbbbbbb", Role: auth.RoleAnalyst}
	if _, err := service.Status(t.Context(), analyst); !errors.Is(err, ErrForbidden) {
		t.Fatalf("status: %v", err)
	}
	if _, err := service.PlaceHold(t.Context(), analyst, HoldInput{ContactID: "20000000-0000-4000-8000-000000000002", Reason: "Not allowed for analysts"}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("hold: %v", err)
	}
}

func TestAnalyticsAndLogRedaction(t *testing.T) {
	t.Parallel()
	analyticsService := analytics.NewService(&analytics.MemoryStore{}, analytics.NoopSink{}, func() (string, error) {
		return "10000000-0000-4000-8000-000000000099", nil
	})
	if _, err := analyticsService.Track(t.Context(), analytics.TrackInput{
		Name:       analytics.EventBookingSubmitted,
		Properties: map[string]string{"email": "leak@example.invalid"},
	}); !errors.Is(err, analytics.ErrInvalid) {
		t.Fatalf("analytics pii: %v", err)
	}

	var output bytes.Buffer
	logger := slog.New(observability.NewJSONHandler(&output, nil))
	logger.Info("privacy", "request_id", "rid", "customer_email", "leak@example.invalid", "status", 200)
	line := output.String()
	if strings.Contains(line, "leak@example.invalid") || !strings.Contains(line, "[REDACTED]") {
		t.Fatalf("log leak: %s", line)
	}
}
