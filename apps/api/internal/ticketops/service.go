package ticketops

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/payments"
)

type Store interface {
	ListOrders(context.Context, OrderFilter) ([]OrderView, []Summary, error)
	Resend(context.Context, string, string, time.Time) error
	VoidTicket(context.Context, string, string, string, time.Time) error
	BeginRefund(context.Context, RefundInput, string, string, time.Time) (Refund, string, error)
	CompleteRefund(context.Context, string, string, string, string, string, time.Time) (Refund, error)
	Attendees(context.Context, string, string, time.Time) ([]Attendee, error)
	CancelEvent(context.Context, string, string, string, time.Time) (int, error)
}
type Telemetry interface{ TicketOperation(string, string, string) }
type Service struct {
	store     Store
	provider  payments.PaymentProvider
	telemetry Telemetry
	now       func() time.Time
}

func NewService(store Store, provider payments.PaymentProvider, telemetry Telemetry) *Service {
	return &Service{store: store, provider: provider, telemetry: telemetry, now: time.Now}
}
func (s *Service) List(ctx context.Context, filter OrderFilter) ([]OrderView, []Summary, error) {
	return s.store.ListOrders(ctx, filter)
}
func (s *Service) Resend(ctx context.Context, actor, id string) error {
	if !validUUID(id) {
		return ErrInvalid
	}
	err := s.store.Resend(ctx, id, actor, s.now().UTC())
	s.emit("resend", id, err)
	return err
}
func (s *Service) Void(ctx context.Context, actor, id, reason string) error {
	var err error
	if !validUUID(id) {
		return ErrInvalid
	}
	if reason, err = normalizeReason(reason); err != nil {
		return err
	}
	err = s.store.VoidTicket(ctx, id, reason, actor, s.now().UTC())
	s.emit("void", id, err)
	return err
}
func (s *Service) Refund(ctx context.Context, actor string, input RefundInput) (Refund, error) {
	var err error
	if !validUUID(input.OrderID) || !validAmount(input.Amount) || len(input.IdempotencyKey) < 16 || len(input.IdempotencyKey) > 128 {
		return Refund{}, ErrInvalid
	}
	if input.Reason, err = normalizeReason(input.Reason); err != nil {
		return Refund{}, err
	}
	digest := sha256.Sum256([]byte(input.IdempotencyKey))
	input.IdempotencyKey = hex.EncodeToString(digest[:])
	intent, paymentRef, err := s.store.BeginRefund(ctx, input, actor, s.provider.Name(), s.now().UTC())
	if err != nil {
		return Refund{}, err
	}
	if intent.Replay {
		return intent, nil
	}
	result, err := s.provider.Refund(ctx, payments.RefundRequest{PaymentReference: paymentRef, Amount: intent.Amount, Currency: intent.Currency, Reason: intent.Reason, IdempotencyKey: input.IdempotencyKey})
	if err != nil {
		_, _ = s.store.CompleteRefund(ctx, intent.ID, "provider_failed", "", "provider_unavailable", actor, s.now().UTC())
		s.emit("refund", input.OrderID, err)
		return Refund{}, ErrUnavailable
	}
	intent, err = s.store.CompleteRefund(ctx, intent.ID, result.Status, result.Reference, "", actor, s.now().UTC())
	s.emit("refund", input.OrderID, err)
	return intent, err
}
func (s *Service) Attendees(ctx context.Context, actor, eventID string) ([]Attendee, error) {
	if !validUUID(eventID) {
		return nil, ErrInvalid
	}
	return s.store.Attendees(ctx, eventID, actor, s.now().UTC())
}
func (s *Service) CancelEvent(ctx context.Context, actor, eventID, reason string) (int, error) {
	var err error
	if !validUUID(eventID) {
		return 0, ErrInvalid
	}
	if reason, err = normalizeReason(reason); err != nil {
		return 0, err
	}
	n, err := s.store.CancelEvent(ctx, eventID, reason, actor, s.now().UTC())
	s.emit("cancel_event", eventID, err)
	return n, err
}
func (s *Service) emit(action, id string, err error) {
	if s.telemetry != nil {
		outcome := "accepted"
		if err != nil {
			outcome = "rejected"
		}
		s.telemetry.TicketOperation(action, id, outcome)
	}
}
