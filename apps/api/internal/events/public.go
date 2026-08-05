package events

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type PublicTicket struct {
	PublicID     string       `json:"id"`
	Name         string       `json:"name"`
	Description  string       `json:"description"`
	Price        string       `json:"price"`
	Currency     string       `json:"currency"`
	Capacity     int          `json:"capacity"`
	Sold         int          `json:"sold"`
	Reserved     int          `json:"reserved"`
	MinPerOrder  int          `json:"min_per_order"`
	MaxPerOrder  int          `json:"max_per_order"`
	SalesStart   time.Time    `json:"sales_start"`
	SalesEnd     time.Time    `json:"sales_end"`
	Availability TicketStatus `json:"availability"`
	CheckoutHref string       `json:"checkout_href,omitempty"`
}
type PublicEvent struct {
	PublicID      string         `json:"id"`
	Slug          string         `json:"slug"`
	Title         string         `json:"title"`
	Summary       string         `json:"summary"`
	Description   string         `json:"description"`
	Venue         Venue          `json:"venue"`
	Policies      Policies       `json:"policies"`
	StartsAt      time.Time      `json:"starts_at"`
	EndsAt        time.Time      `json:"ends_at"`
	Timezone      string         `json:"timezone"`
	BannerAssetID string         `json:"banner_asset_id"`
	Banner        BannerSchedule `json:"banner"`
	Tickets       []PublicTicket `json:"tickets"`
	Availability  TicketStatus   `json:"availability"`
}
type PublicReader interface {
	ListPublished(context.Context) ([]Event, error)
	FindPublishedBySlug(context.Context, string) (Event, error)
	ListTickets(context.Context, string) ([]TicketType, error)
}
type PublicService struct {
	reader PublicReader
	now    func() time.Time
}

func NewPublicService(reader PublicReader) *PublicService {
	return &PublicService{reader: reader, now: time.Now}
}
func (s *PublicService) List(ctx context.Context) ([]PublicEvent, error) {
	events, err := s.reader.ListPublished(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]PublicEvent, 0, len(events))
	for _, event := range events {
		if !publicReady(event) {
			continue
		}
		item, e := s.compose(ctx, event)
		if e != nil {
			return nil, e
		}
		result = append(result, item)
	}
	return result, nil
}
func (s *PublicService) BySlug(ctx context.Context, slug string) (PublicEvent, error) {
	if !ValidSlug(slug) {
		return PublicEvent{}, ErrNotFound
	}
	event, err := s.reader.FindPublishedBySlug(ctx, slug)
	if err != nil {
		return PublicEvent{}, err
	}
	if !publicReady(event) {
		return PublicEvent{}, ErrNotFound
	}
	return s.compose(ctx, event)
}
func publicReady(event Event) bool {
	return strings.TrimSpace(event.Title) != "" && strings.TrimSpace(event.Summary) != "" && strings.TrimSpace(event.Description) != "" && strings.TrimSpace(event.Venue.Name) != "" && strings.TrimSpace(event.Venue.Address) != "" && strings.TrimSpace(event.Venue.City) != "" && strings.TrimSpace(event.Policies.Refunds) != "" && strings.TrimSpace(event.Policies.Entry) != ""
}
func (s *PublicService) compose(ctx context.Context, event Event) (PublicEvent, error) {
	tickets, err := s.reader.ListTickets(ctx, event.PublicID)
	if err != nil {
		return PublicEvent{}, err
	}
	now := s.now().UTC()
	publicTickets := make([]PublicTicket, 0, len(tickets))
	availability := TicketSaleEnded
	for _, ticket := range tickets {
		state := TicketState(ticket, now)
		checkout := ""
		if state == TicketOnSale {
			checkout = "/tickets/checkout?event=" + event.PublicID + "&ticket=" + ticket.PublicID
		}
		publicTickets = append(publicTickets, PublicTicket{ticket.PublicID, ticket.Name, ticket.Description, ticket.Price, ticket.Currency, ticket.Capacity, ticket.Sold, ticket.Reserved, ticket.MinPerOrder, ticket.MaxPerOrder, ticket.SalesStart, ticket.SalesEnd, state, checkout})
		availability = preferAvailability(availability, state)
	}
	return PublicEvent{event.PublicID, event.Slug, event.Title, event.Summary, event.Description, event.Venue, event.Policies, event.StartsAt, event.EndsAt, event.Timezone, event.BannerAssetID, event.Banner, publicTickets, availability}, nil
}
func preferAvailability(current, candidate TicketStatus) TicketStatus {
	rank := map[TicketStatus]int{TicketOnSale: 5, TicketScheduled: 4, TicketPaused: 3, TicketSoldOut: 2, TicketSaleEnded: 1}
	if rank[candidate] > rank[current] {
		return candidate
	}
	return current
}

func (store *MongoStore) ListPublished(ctx context.Context) ([]Event, error) {
	cursor, err := store.database.Collection("events").Find(ctx, bson.M{"status": EventPublished}, options.Find().SetSort(bson.D{{Key: "starts_at", Value: 1}, {Key: "public_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var docs []eventDocument
	if err = cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	items := make([]Event, len(docs))
	for i := range docs {
		items[i] = docs[i].Event
	}
	return items, nil
}
func (store *MongoStore) FindPublishedBySlug(ctx context.Context, slug string) (Event, error) {
	var doc eventDocument
	if err := store.database.Collection("events").FindOne(ctx, bson.M{"slug": slug, "status": EventPublished}).Decode(&doc); err != nil {
		return Event{}, mapNotFound(err)
	}
	return doc.Event, nil
}

type PublicHandler struct{ service *PublicService }

func NewPublicHandler(service *PublicService) *PublicHandler { return &PublicHandler{service: service} }
func (h *PublicHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		publicProblem(w, http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=30, stale-while-revalidate=60")
	path := strings.TrimPrefix(r.URL.Path, "/api/public/events")
	if path == "" || path == "/" {
		items, err := h.service.List(r.Context())
		if err != nil {
			publicProblem(w, http.StatusServiceUnavailable)
			return
		}
		publicJSON(w, http.StatusOK, map[string]any{"items": items})
		return
	}
	slug := strings.TrimPrefix(path, "/")
	if strings.Contains(slug, "/") {
		publicProblem(w, http.StatusNotFound)
		return
	}
	item, err := h.service.BySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			publicProblem(w, http.StatusNotFound)
		} else {
			publicProblem(w, http.StatusServiceUnavailable)
		}
		return
	}
	publicJSON(w, http.StatusOK, item)
}
func publicJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func publicProblem(w http.ResponseWriter, status int) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "about:blank", "title": http.StatusText(status), "status": status})
}

var _ PublicReader = (*MongoStore)(nil)
