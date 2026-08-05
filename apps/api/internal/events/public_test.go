package events

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type publicReaderFake struct {
	events  []Event
	tickets []TicketType
}

func (f publicReaderFake) ListPublished(context.Context) ([]Event, error) { return f.events, nil }
func (f publicReaderFake) FindPublishedBySlug(_ context.Context, slug string) (Event, error) {
	for _, event := range f.events {
		if event.Slug == slug {
			return event, nil
		}
	}
	return Event{}, ErrNotFound
}
func (f publicReaderFake) ListTickets(context.Context, string) ([]TicketType, error) {
	return f.tickets, nil
}
func TestPublicEventsExposePublishedDTOAndLiveAvailability(t *testing.T) {
	now := time.Date(2026, 8, 5, 18, 0, 0, 0, time.UTC)
	reader := publicReaderFake{events: []Event{{PublicID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c301", Slug: "public-event", Title: "Public Event", Summary: "Summary", Description: "Description", StartsAt: now.Add(time.Hour), EndsAt: now.Add(3 * time.Hour), Timezone: "Africa/Accra", Venue: Venue{Name: "Venue", Address: "Address", City: "Accra", CountryCode: "GH"}, Policies: Policies{Refunds: "Policy", Entry: "Policy"}, Status: EventPublished}}, tickets: []TicketType{{PublicID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c302", Name: "GA", Price: "25.50", Currency: "GHS", Capacity: 10, MinPerOrder: 1, MaxPerOrder: 4, SalesStart: now.Add(-time.Hour), SalesEnd: now.Add(2 * time.Hour)}}}
	service := NewPublicService(reader)
	service.now = func() time.Time { return now }
	handler := NewPublicHandler(service)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/public/events", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	var body struct {
		Items []PublicEvent `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 1 || body.Items[0].PublicID != reader.events[0].PublicID || body.Items[0].Availability != TicketOnSale || len(body.Items[0].Tickets) != 1 {
		t.Fatalf("body=%+v", body)
	}
	if !strings.Contains(response.Body.String(), `"banner_asset_id":""`) {
		t.Fatalf("banner asset identity missing: %s", response.Body.String())
	}
	detail := httptest.NewRecorder()
	handler.ServeHTTP(detail, httptest.NewRequest(http.MethodGet, "/api/public/events/public-event", nil))
	if detail.Code != http.StatusOK {
		t.Fatalf("detail status=%d", detail.Code)
	}
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/api/public/events/draft-event", nil))
	if missing.Code != http.StatusNotFound || missing.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("missing status=%d headers=%v", missing.Code, missing.Header())
	}
}
