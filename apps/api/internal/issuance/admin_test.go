package issuance

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDeadLettersDenyUnauthenticatedAccessBeforeDatabaseRead(t *testing.T) {
	response := httptest.NewRecorder()
	NewAdminHandler(nil, nil).DeadLetters(response, httptest.NewRequest(http.MethodGet, "/api/admin/ticket-deliveries/dead-letters", nil))
	if response.Code != http.StatusForbidden || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("response=%d headers=%v", response.Code, response.Header())
	}
}

func TestDeadLetterViewContainsNoBuyerOrAccessData(t *testing.T) {
	body, err := json.Marshal(DeadLetterView{ID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c204", OrderReference: "JKT-2026-ABC12345", Kind: "ticket.purchase_confirmation", Attempts: 8, ErrorCode: "delivery_failed", DeadLetteredAt: time.Now()})
	if err != nil || strings.Contains(string(body), "email") || strings.Contains(string(body), "access") || strings.Contains(string(body), "buyer") {
		t.Fatalf("unsafe operator payload: %s err=%v", body, err)
	}
}
