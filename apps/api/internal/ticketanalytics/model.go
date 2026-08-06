package ticketanalytics

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

var (
	ErrForbidden   = errors.New("ticket analytics forbidden")
	ErrUnavailable = errors.New("ticket analytics unavailable")
)

type Actor struct {
	UserID string
	Role   auth.Role
}

type MoneySummary struct {
	Currency string `json:"currency"`
	Revenue  string `json:"revenue"`
	Fees     string `json:"fees"`
	Refunded string `json:"refunded"`
	Net      string `json:"net"`
	Orders   int    `json:"orders"`
}

type SettlementSummary struct {
	Currency         string `json:"currency"`
	RecordedNet      string `json:"recorded_net"`
	ProviderReported string `json:"provider_reported"`
	Variance         string `json:"variance"`
	Note             string `json:"note"`
}

type InventorySummary struct {
	QuantityTotal     int64 `json:"quantity_total"`
	QuantityReserved  int64 `json:"quantity_reserved"`
	QuantitySold      int64 `json:"quantity_sold"`
	QuantityAvailable int64 `json:"quantity_available"`
}

type FunnelSummary struct {
	SelectionStarted  int `json:"selection_started"`
	CheckoutStarted   int `json:"checkout_started"`
	PurchaseCompleted int `json:"purchase_completed"`
	PurchaseFailed    int `json:"purchase_failed"`
	CheckedInEvents   int `json:"checked_in_events"`
}

type AttendanceSummary struct {
	Valid     int64 `json:"valid"`
	CheckedIn int64 `json:"checked_in"`
	Void      int64 `json:"void"`
	Refunded  int64 `json:"refunded"`
}

type EventAttendance struct {
	EventID   string `json:"event_id"`
	Title     string `json:"title"`
	CheckedIn int64  `json:"checked_in"`
	Issued    int64  `json:"issued"`
}

type Dashboard struct {
	GeneratedAt time.Time           `json:"generated_at"`
	Sales       []MoneySummary      `json:"sales,omitempty"`
	Settlement  []SettlementSummary `json:"settlement,omitempty"`
	Inventory   InventorySummary    `json:"inventory"`
	Funnel      FunnelSummary       `json:"funnel"`
	Attendance  AttendanceSummary   `json:"attendance"`
	Events      []EventAttendance   `json:"events"`
	Financial   bool                `json:"financial"`
}

func canRead(role auth.Role) bool {
	return role.Allows(auth.PermissionDashboardsRead)
}

func canReadFinancial(role auth.Role) bool {
	return role.Allows(auth.PermissionFinancialRecords)
}

func minor(value string) (int64, error) {
	parts := strings.Split(value, ".")
	if len(parts) != 2 || len(parts[1]) != 2 {
		return 0, errors.New("invalid money")
	}
	major, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, err
	}
	fraction, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return 0, err
	}
	return major*100 + fraction, nil
}

func moneyString(value int64) string {
	sign := ""
	if value < 0 {
		sign = "-"
		value = -value
	}
	return sign + strconv.FormatInt(value/100, 10) + "." + fmt.Sprintf("%02d", value%100)
}
