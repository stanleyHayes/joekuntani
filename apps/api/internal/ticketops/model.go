package ticketops

import (
	"crypto/rand"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	ErrInvalid     = errors.New("invalid ticket operation")
	ErrForbidden   = errors.New("ticket operation forbidden")
	ErrNotFound    = errors.New("ticket record not found")
	ErrConflict    = errors.New("ticket operation conflict")
	ErrUnavailable = errors.New("ticket operation unavailable")
	uuid           = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	money          = regexp.MustCompile(`^(0|[1-9][0-9]{0,8})\.[0-9]{2}$`)
)

type OrderFilter struct {
	EventID  string `json:"event_id"`
	Status   string `json:"status"`
	Query    string `json:"query"`
	DateFrom string `json:"date_from"`
	DateTo   string `json:"date_to"`
}
type OrderView struct {
	ID         string    `json:"id"`
	Reference  string    `json:"reference"`
	EventID    string    `json:"event_id"`
	BuyerName  string    `json:"buyer_name"`
	BuyerEmail string    `json:"buyer_email"`
	Currency   string    `json:"currency"`
	Subtotal   string    `json:"subtotal"`
	Fees       string    `json:"fees"`
	Total      string    `json:"total"`
	Refunded   string    `json:"refunded"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
}
type Summary struct {
	Currency string `json:"currency"`
	Revenue  string `json:"revenue"`
	Fees     string `json:"fees"`
	Refunded string `json:"refunded"`
	Net      string `json:"net"`
	Orders   int    `json:"orders"`
}
type RefundInput struct {
	OrderID        string `json:"order_id"`
	Amount         string `json:"amount"`
	Reason         string `json:"reason"`
	IdempotencyKey string `json:"-"`
}
type Refund struct {
	ID                string    `json:"id"`
	OrderID           string    `json:"order_id"`
	Amount            string    `json:"amount"`
	Currency          string    `json:"currency"`
	Reason            string    `json:"reason"`
	Provider          string    `json:"provider"`
	ProviderReference string    `json:"provider_reference"`
	Status            string    `json:"status"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
	Replay            bool      `json:"replay"`
}
type Attendee struct {
	TicketID       string `json:"ticket_id"`
	OrderReference string `json:"order_reference"`
	TicketTypeID   string `json:"ticket_type_id"`
	AttendeeName   string `json:"attendee_name"`
	BuyerName      string `json:"buyer_name"`
	BuyerEmail     string `json:"buyer_email"`
	Status         string `json:"status"`
}

func normalizeReason(value string) (string, error) {
	value = strings.Join(strings.Fields(value), " ")
	if len(value) < 3 || len(value) > 500 {
		return "", ErrInvalid
	}
	return value, nil
}
func validUUID(value string) bool { return uuid.MatchString(strings.TrimSpace(value)) }
func validAmount(value string) bool {
	return money.MatchString(strings.TrimSpace(value)) && value != "0.00"
}
func minor(value string) (int64, error) {
	if !money.MatchString(value) {
		return 0, ErrInvalid
	}
	parts := strings.Split(value, ".")
	major, e := strconv.ParseInt(parts[0], 10, 64)
	if e != nil {
		return 0, ErrInvalid
	}
	fraction, _ := strconv.ParseInt(parts[1], 10, 64)
	return major*100 + fraction, nil
}
func moneyString(value int64) string {
	return strconv.FormatInt(value/100, 10) + "." + fmt.Sprintf("%02d", value%100)
}
func UUID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
