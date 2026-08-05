package bookings

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeRejectsTrailingJSON(t *testing.T) {
	request := httptest.NewRequest("POST", "/", strings.NewReader(`{"title":"valid"}{"forged":true}`))
	response := httptest.NewRecorder()
	var input Input
	if decode(response, request, &input) {
		t.Fatal("decode accepted a second JSON value")
	}
	if response.Code != 422 {
		t.Fatalf("status = %d, want 422", response.Code)
	}
}
