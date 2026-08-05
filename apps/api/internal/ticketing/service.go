package ticketing

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

type Store interface {
	Create(context.Context, string, string, CreateInput, time.Time, time.Duration, func() (string, error)) (Receipt, error)
	ExpireDue(context.Context, time.Time, int) (int, error)
	ReconcileLatePayment(context.Context, string, time.Time, time.Duration, bool) (LatePaymentResult, error)
}
type Telemetry interface{ TicketCheckoutStarted(string, string, int) }
type Service struct {
	store     Store
	hold      time.Duration
	now       func() time.Time
	id        func() (string, error)
	telemetry Telemetry
}

func NewService(store Store, hold time.Duration, telemetry Telemetry) (*Service, error) {
	if hold < time.Minute || hold > 30*time.Minute {
		return nil, ErrInvalid
	}
	return &Service{store: store, hold: hold, now: time.Now, id: uuid, telemetry: telemetry}, nil
}
func (s *Service) Create(ctx context.Context, input CreateInput) (Receipt, error) {
	if err := normalizeAndValidate(&input); err != nil {
		return Receipt{}, err
	}
	hash := sha256.Sum256([]byte(input.IdempotencyKey))
	canonical, marshalErr := json.Marshal(struct {
		EventID, BuyerName, BuyerEmail, BuyerPhone, TermsVersion string
		Items                                                    []Selection
	}{input.EventID, input.BuyerName, input.BuyerEmail, input.BuyerPhone, input.TermsVersion, input.Items})
	if marshalErr != nil {
		return Receipt{}, ErrInvalid
	}
	requestDigest := sha256.Sum256(canonical)
	var receipt Receipt
	var err error
	for attempt := 0; attempt < 5; attempt++ {
		receipt, err = s.store.Create(ctx, hex.EncodeToString(hash[:]), hex.EncodeToString(requestDigest[:]), input, s.now().UTC(), s.hold, s.id)
		if !errors.Is(err, ErrConflict) {
			break
		}
	}
	if err == nil && receipt.Stored && s.telemetry != nil {
		quantity := 0
		for _, item := range input.Items {
			quantity += item.Quantity
		}
		s.telemetry.TicketCheckoutStarted(receipt.Reference, input.EventID, quantity)
	}
	return receipt, err
}
func (s *Service) Expire(ctx context.Context, limit int) (int, error) {
	if limit < 1 || limit > 100 {
		return 0, ErrInvalid
	}
	return s.store.ExpireDue(ctx, s.now().UTC(), limit)
}
func (s *Service) ReconcileLatePayment(ctx context.Context, reference string, trusted bool) (LatePaymentResult, error) {
	if !trusted {
		return "", ErrForbidden
	}
	return s.store.ReconcileLatePayment(ctx, reference, s.now().UTC(), s.hold, trusted)
}
func uuid() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
func reference(now time.Time) (string, error) {
	b := make([]byte, 5)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("JKT-%04d-%s", now.Year(), hex.EncodeToString(b)[:8]), nil
}
