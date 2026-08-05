package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/httpapi"
)

func TestHealthEndpoints(t *testing.T) {
	t.Parallel()

	tests := []struct {
		path   string
		status string
	}{
		{path: "/health/live", status: "live"},
		{path: "/health/ready", status: "ready"},
	}

	for _, test := range tests {
		test := test
		t.Run(test.path, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest(http.MethodGet, test.path, nil)
			response := httptest.NewRecorder()
			httpapi.NewHandler().ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
			}
			if contentType := response.Header().Get("Content-Type"); contentType != "application/json" {
				t.Fatalf("Content-Type = %q, want application/json", contentType)
			}

			var body struct {
				Status string `json:"status"`
			}
			if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if body.Status != test.status {
				t.Fatalf("status body = %q, want %q", body.Status, test.status)
			}
		})
	}
}

func TestRequestIDAndAccessLogExcludeQuery(t *testing.T) {
	t.Parallel()
	var output bytes.Buffer
	handler := httpapi.NewHandler(httpapi.Options{Logger: slog.New(slog.NewJSONHandler(&output, nil))})
	request := httptest.NewRequest(http.MethodGet, "/health/live?token=private", nil)
	request.Header.Set("X-Request-ID", "0123456789abcdef0123456789abcdef")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if got := response.Header().Get("X-Request-ID"); got != "0123456789abcdef0123456789abcdef" {
		t.Fatalf("X-Request-ID = %q", got)
	}
	if bytes.Contains(output.Bytes(), []byte("private")) || !bytes.Contains(output.Bytes(), []byte(`"route":"/health/live"`)) {
		t.Fatalf("unsafe or incomplete access log: %s", output.String())
	}
}

func TestInvalidRequestIDIsReplaced(t *testing.T) {
	t.Parallel()
	request := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	request.Header.Set("X-Request-ID", "contains spaces and PII@example.com")
	response := httptest.NewRecorder()
	httpapi.NewHandler().ServeHTTP(response, request)
	if got := response.Header().Get("X-Request-ID"); got == "" || got == request.Header.Get("X-Request-ID") {
		t.Fatalf("unsafe request ID was not replaced: %q", got)
	}
}

func TestReadinessFailureIsGeneric(t *testing.T) {
	t.Parallel()
	handler := httpapi.NewHandler(httpapi.Options{ReadinessChecks: []httpapi.ReadinessCheck{
		func(context.Context) error { return errors.New("database password private") },
	}})
	request := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
	if bytes.Contains(response.Body.Bytes(), []byte("password")) || !bytes.Contains(response.Body.Bytes(), []byte("Service not ready")) {
		t.Fatalf("readiness leaked detail: %s", response.Body.String())
	}
}

func TestUnknownRouteReturnsNotFound(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodGet, "/not-a-route", nil)
	response := httptest.NewRecorder()
	httpapi.NewHandler().ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

func TestCRMWorkflowRoutesAreExplicit(t *testing.T) {
	workflow := http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { response.WriteHeader(218) })
	download := http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { response.WriteHeader(219) })
	handler := httpapi.NewHandler(httpapi.Options{AdminCRMWorkflow: workflow, AdminCRMProposalDownload: download})
	for _, test := range []struct {
		method, path string
		status       int
	}{{http.MethodGet, "/api/admin/crm/enquiries/00000000-0000-4000-8000-000000000001/workflow", 218}, {http.MethodPost, "/api/admin/crm/enquiries/00000000-0000-4000-8000-000000000001/notes", 218}, {http.MethodPost, "/api/admin/crm/enquiries/00000000-0000-4000-8000-000000000001/tasks/task/complete", 218}, {http.MethodPost, "/api/admin/crm/enquiries/00000000-0000-4000-8000-000000000001/attachments/attachment/access", 218}, {http.MethodGet, "/api/admin/crm/enquiries/00000000-0000-4000-8000-000000000001/deliveries", 218}, {http.MethodPost, "/api/admin/crm/enquiries/00000000-0000-4000-8000-000000000001/deliveries/delivery/retry", 218}, {http.MethodGet, "/api/admin/crm/proposal-download?asset=id", 219}} {
		request := httptest.NewRequest(test.method, test.path, nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != test.status {
			t.Fatalf("%s %s=%d want %d", test.method, test.path, response.Code, test.status)
		}
	}
}

func TestMediaRoutesUseExplicitCompositionHandlers(t *testing.T) {
	marker := func(status int) http.Handler {
		return http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { response.WriteHeader(status) })
	}
	handler := httpapi.NewHandler(httpapi.Options{AdminMediaList: marker(210), AdminMediaUpload: marker(211), AdminMediaRetry: marker(212), AdminMediaUpdate: marker(213), AdminMediaDelete: marker(214), MediaCallback: marker(215)})
	tests := []struct {
		method, path string
		status       int
	}{{http.MethodGet, "/api/admin/media", 210}, {http.MethodPost, "/api/admin/media/uploads", 211}, {http.MethodPost, "/api/admin/media/id/upload", 212}, {http.MethodPatch, "/api/admin/media/id", 213}, {http.MethodDelete, "/api/admin/media/id", 214}, {http.MethodPost, "/api/media/callbacks/cloudinary", 215}}
	for _, test := range tests {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(test.method, test.path, nil))
		if response.Code != test.status {
			t.Errorf("%s %s = %d, want %d", test.method, test.path, response.Code, test.status)
		}
	}
}

func TestTicketDeliveryDeadLetterRouteUsesExplicitCompositionHandler(t *testing.T) {
	handler := httpapi.NewHandler(httpapi.Options{AdminTicketDeadLetters: http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { response.WriteHeader(216) })})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/admin/ticket-deliveries/dead-letters", nil))
	if response.Code != 216 {
		t.Fatalf("status = %d, want 216", response.Code)
	}
}

func TestBookingRoutesUseExplicitCompositionHandler(t *testing.T) {
	handler := httpapi.NewHandler(httpapi.Options{AdminBookings: http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { response.WriteHeader(217) })})
	for _, path := range []string{"/api/admin/bookings", "/api/admin/bookings/calendar.ics", "/api/admin/bookings/id"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != 217 {
			t.Fatalf("%s status=%d", path, response.Code)
		}
	}
}

func TestCampaignRoutesUseExplicitCompositionHandler(t *testing.T) {
	handler := httpapi.NewHandler(httpapi.Options{AdminCampaigns: http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { response.WriteHeader(218) })})
	for _, path := range []string{"/api/admin/campaigns", "/api/admin/campaigns/id", "/api/admin/campaigns/id/deliverables"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != 218 {
			t.Fatalf("%s status=%d", path, response.Code)
		}
	}
}

func TestServiceRoutesUseExplicitCompositionHandlers(t *testing.T) {
	marker := func(status int) http.Handler {
		return http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { response.WriteHeader(status) })
	}
	handler := httpapi.NewHandler(httpapi.Options{
		PublicServicesList: marker(220), PublicServicesDetail: marker(221),
		AdminServicesList: marker(222), AdminServicesCreate: marker(223), AdminServicesOrder: marker(224),
		AdminServicesUpdate: marker(225), AdminServicesActive: marker(226),
	})
	tests := []struct {
		method, path string
		status       int
	}{
		{http.MethodGet, "/api/public/services", 220},
		{http.MethodGet, "/api/public/services/example", 221},
		{http.MethodGet, "/api/admin/services", 222},
		{http.MethodPost, "/api/admin/services", 223},
		{http.MethodPut, "/api/admin/services/order", 224},
		{http.MethodPut, "/api/admin/services/id", 225},
		{http.MethodPatch, "/api/admin/services/id/active", 226},
	}
	for _, test := range tests {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(test.method, test.path, nil))
		if response.Code != test.status {
			t.Errorf("%s %s = %d, want %d", test.method, test.path, response.Code, test.status)
		}
	}
}

func TestContentRoutesUseExplicitCompositionHandlers(t *testing.T) {
	marker := func(status int) http.Handler {
		return http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { response.WriteHeader(status) })
	}
	handler := httpapi.NewHandler(httpapi.Options{
		PublicContentList: marker(230), PublicContentDetail: marker(231),
		AdminContentList: marker(232), AdminContentCreate: marker(233), AdminContentPreview: marker(234),
		AdminContentUpdate: marker(235), AdminContentDelete: marker(236), AdminContentApproval: marker(237), AdminContentPublish: marker(238),
	})
	tests := []struct {
		method, path string
		status       int
	}{
		{http.MethodGet, "/api/public/content/page", 230},
		{http.MethodGet, "/api/public/content/page/about", 231},
		{http.MethodGet, "/api/admin/content/page", 232},
		{http.MethodPost, "/api/admin/content/page", 233},
		{http.MethodGet, "/api/admin/content/page/id/preview", 234},
		{http.MethodPut, "/api/admin/content/page/id", 235},
		{http.MethodDelete, "/api/admin/content/page/id", 236},
		{http.MethodPatch, "/api/admin/content/page/id/approval", 237},
		{http.MethodPatch, "/api/admin/content/page/id/publication", 238},
	}
	for _, test := range tests {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(test.method, test.path, nil))
		if response.Code != test.status {
			t.Errorf("%s %s = %d, want %d", test.method, test.path, response.Code, test.status)
		}
	}
}

func TestEventRoutesSeparateReadAndMutationComposition(t *testing.T) {
	marker := func(status int) http.Handler {
		return http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { response.WriteHeader(status) })
	}
	handler := httpapi.NewHandler(httpapi.Options{AdminEventsRead: marker(240), AdminEventsWrite: marker(241)})
	tests := []struct {
		method, path string
		status       int
	}{
		{http.MethodGet, "/api/admin/events", 240},
		{http.MethodGet, "/api/admin/events/id/preview", 240},
		{http.MethodPost, "/api/admin/events", 241},
		{http.MethodPut, "/api/admin/events/id", 241},
		{http.MethodPost, "/api/admin/events/id/publish", 241},
		{http.MethodPost, "/api/admin/events/id/cancel", 241},
		{http.MethodPost, "/api/admin/events/id/tickets", 241},
		{http.MethodPut, "/api/admin/events/id/tickets/ticket", 241},
		{http.MethodPost, "/api/admin/events/id/tickets/ticket/pause", 241},
		{http.MethodPost, "/api/admin/events/id/tickets/ticket/resume", 241},
	}
	for _, test := range tests {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(test.method, test.path, nil))
		if response.Code != test.status {
			t.Errorf("%s %s = %d, want %d", test.method, test.path, response.Code, test.status)
		}
	}
}
