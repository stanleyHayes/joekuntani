package ticketanalytics

import (
	"context"
	"time"
)

type Store interface {
	SalesByCurrency(context.Context) ([]MoneySummary, error)
	Inventory(context.Context) (InventorySummary, error)
	Funnel(context.Context, time.Time) (FunnelSummary, error)
	Attendance(context.Context) (AttendanceSummary, error)
	EventAttendance(context.Context, int64) ([]EventAttendance, error)
}

type Service struct {
	store Store
	now   func() time.Time
}

func NewService(store Store) *Service {
	return &Service{store: store, now: func() time.Time { return time.Now().UTC() }}
}

func (s *Service) Dashboard(ctx context.Context, actor Actor) (Dashboard, error) {
	if actor.UserID == "" || !canRead(actor.Role) {
		return Dashboard{}, ErrForbidden
	}
	since := s.now().Add(-30 * 24 * time.Hour)
	inventory, err := s.store.Inventory(ctx)
	if err != nil {
		return Dashboard{}, ErrUnavailable
	}
	funnel, err := s.store.Funnel(ctx, since)
	if err != nil {
		return Dashboard{}, ErrUnavailable
	}
	attendance, err := s.store.Attendance(ctx)
	if err != nil {
		return Dashboard{}, ErrUnavailable
	}
	events, err := s.store.EventAttendance(ctx, 10)
	if err != nil {
		return Dashboard{}, ErrUnavailable
	}
	out := Dashboard{
		GeneratedAt: s.now(),
		Inventory:   inventory,
		Funnel:      funnel,
		Attendance:  attendance,
		Events:      events,
		Financial:   canReadFinancial(actor.Role),
	}
	if out.Financial {
		sales, salesErr := s.store.SalesByCurrency(ctx)
		if salesErr != nil {
			return Dashboard{}, ErrUnavailable
		}
		out.Sales = sales
		out.Settlement = settlementFromSales(sales)
	}
	return out, nil
}

func settlementFromSales(sales []MoneySummary) []SettlementSummary {
	out := make([]SettlementSummary, 0, len(sales))
	for _, row := range sales {
		net, _ := minor(row.Net)
		// Until ADR-004 provider settlement reporting is connected, provider
		// reported net mirrors recorded platform net with an explicit note.
		out = append(out, SettlementSummary{
			Currency:         row.Currency,
			RecordedNet:      row.Net,
			ProviderReported: row.Net,
			Variance:         moneyString(0),
			Note:             "provider_settlement_unavailable",
		})
		_ = net
	}
	return out
}
