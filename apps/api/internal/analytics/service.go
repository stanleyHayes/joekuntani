package analytics

import (
	"context"
	"time"
)

type Store interface {
	AppendConversion(context.Context, ConversionEvent) error
	CountConversions(context.Context, EventName, time.Time) (int, error)
	TopProperty(context.Context, EventName, string, time.Time, int) ([]NamedCount, error)
	PipelineCounts(context.Context) (map[string]int, error)
	BookingStatusCounts(context.Context) (map[string]int, error)
	CampaignStatusCounts(context.Context) (map[string]int, error)
	PublishedContentCount(context.Context) (int, error)
	AudienceMetrics(context.Context, int) ([]AudienceMetric, error)
}

type Sink interface {
	Emit(context.Context, ConversionEvent) error
}

type Service struct {
	store Store
	sink  Sink
	uuid  func() (string, error)
	now   func() time.Time
}

func NewService(store Store, sink Sink, uuid func() (string, error)) *Service {
	if sink == nil {
		sink = NoopSink{}
	}
	return &Service{store: store, sink: sink, uuid: uuid, now: func() time.Time { return time.Now().UTC() }}
}

type NoopSink struct{}

func (NoopSink) Emit(context.Context, ConversionEvent) error { return nil }

func (service *Service) Track(ctx context.Context, input TrackInput) (ConversionEvent, error) {
	normalized, err := sanitize(input)
	if err != nil {
		return ConversionEvent{}, err
	}
	id, err := service.uuid()
	if err != nil {
		return ConversionEvent{}, ErrUnavailable
	}
	event := ConversionEvent{
		PublicID:   id,
		Name:       normalized.Name,
		Properties: normalized.Properties,
		Internal:   internalOnly[normalized.Name],
		OccurredAt: normalized.OccurredAt.UTC(),
		CreatedAt:  service.now(),
	}
	if err = service.store.AppendConversion(ctx, event); err != nil {
		return ConversionEvent{}, ErrUnavailable
	}
	if !event.Internal {
		_ = service.sink.Emit(ctx, event)
	}
	return event, nil
}

func (service *Service) Overview(ctx context.Context, actor Actor) (Overview, error) {
	if actor.UserID == "" || !canRead(actor.Role) {
		return Overview{}, ErrForbidden
	}
	since := service.now().Add(-30 * 24 * time.Hour)
	conversionTotal, err := service.store.CountConversions(ctx, "", since)
	if err != nil {
		return Overview{}, ErrUnavailable
	}
	submitted, err := service.store.CountConversions(ctx, EventBookingSubmitted, since)
	if err != nil {
		return Overview{}, ErrUnavailable
	}
	purchases, err := service.store.CountConversions(ctx, EventTicketPurchaseCompleted, since)
	if err != nil {
		return Overview{}, ErrUnavailable
	}
	pipeline, err := service.store.PipelineCounts(ctx)
	if err != nil {
		return Overview{}, ErrUnavailable
	}
	bookings, err := service.store.BookingStatusCounts(ctx)
	if err != nil {
		return Overview{}, ErrUnavailable
	}
	campaigns, err := service.store.CampaignStatusCounts(ctx)
	if err != nil {
		return Overview{}, ErrUnavailable
	}
	content, err := service.store.PublishedContentCount(ctx)
	if err != nil {
		return Overview{}, ErrUnavailable
	}
	sources, err := service.store.TopProperty(ctx, EventBookingSubmitted, "source", since, 5)
	if err != nil {
		return Overview{}, ErrUnavailable
	}
	paths, err := service.store.TopProperty(ctx, EventPageView, "path", since, 5)
	if err != nil {
		return Overview{}, ErrUnavailable
	}
	audience, err := service.store.AudienceMetrics(ctx, 12)
	if err != nil {
		return Overview{}, ErrUnavailable
	}
	return Overview{
		GeneratedAt:       service.now(),
		ConversionTotal:   conversionTotal,
		BookingSubmitted:  submitted,
		TicketPurchases:   purchases,
		Pipeline:          pipeline,
		BookingsByStatus:  bookings,
		CampaignsByStatus: campaigns,
		ContentPublished:  content,
		TopSources:        sources,
		TopPaths:          paths,
		Audience:          audience,
	}, nil
}
