package ticketing

import (
	"errors"
	"fmt"
	"net/mail"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type OrderStatus string

const (
	StatusPending                OrderStatus = "pending"
	StatusAwaitingPayment        OrderStatus = "awaiting_payment"
	StatusPaid                   OrderStatus = "paid"
	StatusPaymentFailed          OrderStatus = "payment_failed"
	StatusExpired                OrderStatus = "expired"
	StatusCancelled              OrderStatus = "cancelled"
	StatusReconciliationRequired OrderStatus = "reconciliation_required"
	TermsVersionCurrent                      = "2026-08-05"
)

var (
	ErrInvalid     = errors.New("invalid ticket order")
	ErrUnavailable = errors.New("ticket order unavailable")
	ErrConflict    = errors.New("insufficient ticket inventory")
	ErrForbidden   = errors.New("ticket order operation forbidden")
	moneyPattern   = regexp.MustCompile(`^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$`)
)

type Selection struct {
	TicketTypeID string `json:"ticket_type_id"`
	Quantity     int    `json:"quantity"`
}
type CreateInput struct {
	EventID        string      `json:"event_id"`
	BuyerName      string      `json:"buyer_name"`
	BuyerEmail     string      `json:"buyer_email"`
	BuyerPhone     string      `json:"buyer_phone"`
	TermsAccepted  bool        `json:"terms_accepted"`
	TermsVersion   string      `json:"terms_version"`
	Items          []Selection `json:"items"`
	IdempotencyKey string      `json:"-"`
}
type Item struct {
	PublicID, OrderID, EventID, TicketTypeID string
	Quantity                                 int
	UnitPrice, LineTotal                     string
	CreatedAt                                time.Time
}
type Order struct {
	PublicID, Reference, EventID, BuyerName, BuyerEmail, BuyerPhone, Currency, Subtotal, Fees, Total, IdempotencyHash, TermsVersion string
	Status                                                                                                                          OrderStatus
	HoldExpiresAt, TermsAcceptedAt, CreatedAt, UpdatedAt                                                                            time.Time
}
type Receipt struct {
	Reference     string      `json:"reference"`
	Status        OrderStatus `json:"status"`
	Currency      string      `json:"currency"`
	Total         string      `json:"total"`
	HoldExpiresAt time.Time   `json:"hold_expires_at"`
	Stored        bool        `json:"-"`
}
type LatePaymentResult string

const (
	LatePaymentRestored      LatePaymentResult = "reservation_restored"
	LatePaymentReview        LatePaymentResult = "manual_review_required"
	LatePaymentAlreadyActive LatePaymentResult = "already_active"
)

func normalizeAndValidate(input *CreateInput) error {
	input.EventID = strings.TrimSpace(input.EventID)
	input.BuyerName = strings.TrimSpace(input.BuyerName)
	input.BuyerEmail = strings.TrimSpace(input.BuyerEmail)
	input.BuyerPhone = strings.TrimSpace(input.BuyerPhone)
	input.IdempotencyKey = strings.TrimSpace(input.IdempotencyKey)
	address, err := mail.ParseAddress(input.BuyerEmail)
	if !validUUID(input.EventID) || len(input.BuyerName) < 2 || len(input.BuyerName) > 160 || err != nil || !strings.EqualFold(address.Address, input.BuyerEmail) || len(input.BuyerEmail) > 254 || len(input.BuyerPhone) > 40 || !input.TermsAccepted || input.TermsVersion != TermsVersionCurrent || len(input.IdempotencyKey) < 16 || len(input.IdempotencyKey) > 128 || len(input.Items) < 1 || len(input.Items) > 20 {
		return ErrInvalid
	}
	seen := map[string]bool{}
	for _, item := range input.Items {
		if !validUUID(item.TicketTypeID) || item.Quantity < 1 || item.Quantity > 1000 || seen[item.TicketTypeID] {
			return ErrInvalid
		}
		seen[item.TicketTypeID] = true
	}
	return nil
}
func parseMinor(value string) (int64, error) {
	if !moneyPattern.MatchString(value) {
		return 0, ErrInvalid
	}
	parts := strings.SplitN(value, ".", 2)
	major, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, ErrInvalid
	}
	minor := "00"
	if len(parts) == 2 {
		minor = parts[1] + strings.Repeat("0", 2-len(parts[1]))
	}
	fraction, _ := strconv.ParseInt(minor, 10, 64)
	return major*100 + fraction, nil
}
func formatMinor(value int64) string { return fmt.Sprintf("%d.%02d", value/100, value%100) }
func validUUID(value string) bool {
	return len(value) == 36 && value[8] == '-' && value[13] == '-' && value[18] == '-' && value[23] == '-'
}
