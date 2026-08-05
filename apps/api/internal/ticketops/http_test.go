package ticketops

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTicketOperationsDenyMissingPrincipalAndDisableCaching(t *testing.T) {
	response := httptest.NewRecorder()
	NewHandler(nil).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/admin/ticket-ops/orders", nil))
	if response.Code != http.StatusForbidden || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status=%d cache=%q", response.Code, response.Header().Get("Cache-Control"))
	}
}
func TestAttendeeCSVFormulaInjectionIsNeutralized(t *testing.T) {
	for input, want := range map[string]string{"=cmd": "'=cmd", "+1": "'+1", "-2": "'-2", "@x": "'@x", "Ama": "Ama"} {
		if got := safeCSV(input); got != want {
			t.Fatalf("safeCSV(%q)=%q want %q", input, got, want)
		}
	}
}
