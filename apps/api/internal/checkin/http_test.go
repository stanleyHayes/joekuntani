package checkin

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type stubStore struct {
	result ScanResult
	err    error
}

func (s stubStore) Scan(context.Context, Actor, ScanInput, time.Time) (ScanResult, error) {
	return s.result, s.err
}
func (s stubStore) CountCheckedIn(context.Context, string) (int64, error) {
	return 3, nil
}

func TestScanRequiresAuthorizedActor(t *testing.T) {
	t.Parallel()
	handler := NewHandler(NewService(stubStore{result: ScanResult{Result: ResultAdmitted}}), func(*http.Request) (Actor, error) {
		return Actor{}, ErrForbidden
	})
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/admin/checkin/scan", bytes.NewBufferString(`{"event_id":"018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201","token":"bearer-token-123456"}`)))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d", recorder.Code)
	}
	if recorder.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("missing no-store")
	}
}

func TestScanAdmittedAndDuplicateStatuses(t *testing.T) {
	t.Parallel()
	actor := func(*http.Request) (Actor, error) {
		return Actor{UserID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c210", InternalID: "507f1f77bcf86cd799439011", Role: "booking_manager"}, nil
	}
	handler := NewHandler(NewService(stubStore{result: ScanResult{Result: ResultAdmitted, CheckedInCount: 1}}), actor)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/admin/checkin/scan", bytes.NewBufferString(`{"event_id":"018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201","token":"bearer-token-123456"}`)))
	if recorder.Code != http.StatusOK {
		t.Fatalf("admitted status = %d body=%s", recorder.Code, recorder.Body.String())
	}

	handler = NewHandler(NewService(stubStore{result: ScanResult{Result: ResultAlreadyCheckedIn, CheckedInCount: 1}, err: ErrConflict}), actor)
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/admin/checkin/scan", bytes.NewBufferString(`{"event_id":"018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201","token":"bearer-token-123456"}`)))
	if recorder.Code != http.StatusConflict {
		t.Fatalf("duplicate status = %d", recorder.Code)
	}
}

func TestCountEndpoint(t *testing.T) {
	t.Parallel()
	handler := NewHandler(NewService(stubStore{}), func(*http.Request) (Actor, error) {
		return Actor{InternalID: "507f1f77bcf86cd799439011"}, nil
	})
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/checkin/events/018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201/count", nil))
	if recorder.Code != http.StatusOK || !bytes.Contains(recorder.Body.Bytes(), []byte(`"checked_in_count":3`)) {
		t.Fatalf("count = %d body=%s", recorder.Code, recorder.Body.String())
	}
}
