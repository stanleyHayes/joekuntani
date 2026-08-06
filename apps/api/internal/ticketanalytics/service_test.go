package ticketanalytics

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

type stubStore struct {
	sales []MoneySummary
}

func (s stubStore) SalesByCurrency(context.Context) ([]MoneySummary, error) {
	return s.sales, nil
}
func (stubStore) Inventory(context.Context) (InventorySummary, error) {
	return InventorySummary{QuantityTotal: 100, QuantityReserved: 10, QuantitySold: 40, QuantityAvailable: 50}, nil
}
func (stubStore) Funnel(context.Context, time.Time) (FunnelSummary, error) {
	return FunnelSummary{SelectionStarted: 20, CheckoutStarted: 12, PurchaseCompleted: 8, PurchaseFailed: 2, CheckedInEvents: 5}, nil
}
func (stubStore) Attendance(context.Context) (AttendanceSummary, error) {
	return AttendanceSummary{Valid: 30, CheckedIn: 25, Void: 2, Refunded: 3}, nil
}
func (stubStore) EventAttendance(context.Context, int64) ([]EventAttendance, error) {
	return []EventAttendance{{EventID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", Title: "Night Market", CheckedIn: 25, Issued: 40}}, nil
}

func TestDashboardFinancialGate(t *testing.T) {
	t.Parallel()
	service := NewService(stubStore{sales: []MoneySummary{{Currency: "GHS", Revenue: "100.00", Fees: "5.00", Refunded: "10.00", Net: "85.00", Orders: 2}}})
	analyst, err := service.Dashboard(context.Background(), Actor{UserID: "a", Role: auth.RoleAnalyst})
	if err != nil || analyst.Financial || len(analyst.Sales) != 0 {
		t.Fatalf("analyst dashboard = %#v err=%v", analyst, err)
	}
	admin, err := service.Dashboard(context.Background(), Actor{UserID: "a", Role: auth.RoleAdministrator})
	if err != nil || !admin.Financial || len(admin.Sales) != 1 || admin.Settlement[0].Note != "provider_settlement_unavailable" {
		t.Fatalf("admin dashboard = %#v err=%v", admin, err)
	}
}

func TestDashboardRejectsUnauthorized(t *testing.T) {
	t.Parallel()
	service := NewService(stubStore{})
	if _, err := service.Dashboard(context.Background(), Actor{UserID: "x", Role: auth.RoleContentEditor}); err != ErrForbidden {
		t.Fatalf("err=%v", err)
	}
}

func TestHTTPDashboardIsPrivacySafeAndNoStore(t *testing.T) {
	t.Parallel()
	handler := NewHandler(NewService(stubStore{sales: []MoneySummary{{Currency: "GHS", Revenue: "100.00", Fees: "5.00", Refunded: "0.00", Net: "95.00", Orders: 1}}}), func(*http.Request) (Actor, error) {
		return Actor{UserID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c210", Role: auth.RoleAdministrator}, nil
	})
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/ticket-analytics/dashboard", nil))
	if recorder.Code != http.StatusOK || recorder.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("status=%d cache=%q", recorder.Code, recorder.Header().Get("Cache-Control"))
	}
	body := recorder.Body.String()
	for _, leak := range []string{"buyer_email", "buyer_name", "qr_token", "mailto:", "@example"} {
		if strings.Contains(strings.ToLower(body), leak) {
			t.Fatalf("response leaked %q: %s", leak, body)
		}
	}
	var dashboard Dashboard
	if err := json.Unmarshal(recorder.Body.Bytes(), &dashboard); err != nil {
		t.Fatal(err)
	}
	if dashboard.Attendance.CheckedIn != 25 || dashboard.Inventory.QuantityAvailable != 50 {
		t.Fatalf("dashboard=%#v", dashboard)
	}
}

func TestConcurrentDashboardReads(t *testing.T) {
	t.Parallel()
	service := NewService(stubStore{sales: []MoneySummary{{Currency: "GHS", Revenue: "10.00", Fees: "1.00", Refunded: "0.00", Net: "9.00", Orders: 1}}})
	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := service.Dashboard(context.Background(), Actor{UserID: "a", Role: auth.RoleAdministrator})
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent dashboard err=%v", err)
		}
	}
}
