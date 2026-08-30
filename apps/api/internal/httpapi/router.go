package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"time"

	"github.com/go-chi/chi/v5"
)

type healthResponse struct {
	Status string `json:"status"`
}

type problemResponse struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
}

type ReadinessCheck func(context.Context) error

type Options struct {
	Logger                    *slog.Logger
	ReadinessChecks           []ReadinessCheck
	CapturePanic              func(error)
	AdminAuth                 http.Handler
	PublicSettings            http.Handler
	AdminSettingsRead         http.Handler
	AdminSettingsUpdate       http.Handler
	AdminSettingsPublish      http.Handler
	AdminMediaList            http.Handler
	AdminMediaUpload          http.Handler
	AdminMediaRetry           http.Handler
	AdminMediaConfirm         http.Handler
	AdminMediaUpdate          http.Handler
	AdminMediaDelete          http.Handler
	MediaCallback             http.Handler
	PublicServicesList        http.Handler
	PublicServicesDetail      http.Handler
	PublicEnquirySubmit       http.Handler
	PublicEnquiryChallenge    http.Handler
	PublicTicketOrderCreate   http.Handler
	PublicTicketCheckout      http.Handler
	PublicTicketConfirmation  http.Handler
	PaymentWebhook            http.Handler
	PublicEvents              http.Handler
	AdminServicesList         http.Handler
	AdminServicesCreate       http.Handler
	AdminServicesOrder        http.Handler
	AdminServicesUpdate       http.Handler
	AdminServicesActive       http.Handler
	AdminServicesRetire       http.Handler
	PublicContentList         http.Handler
	PublicContentDetail       http.Handler
	PublicMediaAsset          http.Handler
	PublicMediaGallery        http.Handler
	AdminContentList          http.Handler
	AdminContentCreate        http.Handler
	AdminContentPreview       http.Handler
	AdminContentUpdate        http.Handler
	AdminContentDelete        http.Handler
	AdminContentApproval      http.Handler
	AdminContentPublish       http.Handler
	AdminVideosList           http.Handler
	AdminVideosCreateUpload   http.Handler
	AdminVideosCreateLink     http.Handler
	AdminVideosItem           http.Handler
	AdminVideosPublish        http.Handler
	AdminVideosSync           http.Handler
	AdminVideoCategoriesRead  http.Handler
	AdminVideoCategoriesWrite http.Handler
	VideoWebhook              http.Handler
	PublicVideosList          http.Handler
	PublicVideoDetail         http.Handler
	AdminEventsRead           http.Handler
	AdminEventsWrite          http.Handler
	AdminCRM                  http.Handler
	AdminCRMWorkflow          http.Handler
	AdminCRMProposalDownload  http.Handler
	AdminTicketDeadLetters    http.Handler
	AdminBookings             http.Handler
	AdminCampaigns            http.Handler
	AdminTicketOps            http.Handler
	AdminExports              http.Handler
	AdminAudit                http.Handler
	AdminAnalytics            http.Handler
	AdminPrivacy              http.Handler
	AdminSearch               http.Handler
	AdminCheckin              http.Handler
	AdminTicketAnalytics      http.Handler
	PublicAnalyticsTrack      http.Handler
	PublicNewsletter          http.Handler
	AdminNewsletter           http.Handler
	PublicSupport             http.Handler
	AdminSupport              http.Handler
	PublicMerch               http.Handler
	AdminMerch                http.Handler
}

func NewHandler(options ...Options) http.Handler {
	configuration := Options{Logger: slog.Default()}
	if len(options) > 0 {
		configuration = options[0]
		if configuration.Logger == nil {
			configuration.Logger = slog.Default()
		}
	}
	router := chi.NewRouter()
	router.Use(requestID, recoverer(configuration), accessLog(configuration.Logger))
	router.Get("/health/live", health("live", nil))
	router.Get("/health/ready", health("ready", configuration.ReadinessChecks))
	if configuration.AdminAuth != nil {
		router.Mount("/api/admin/auth", configuration.AdminAuth)
	}
	if configuration.PublicSettings != nil {
		router.Method(http.MethodGet, "/api/public/settings", configuration.PublicSettings)
	}
	if configuration.AdminSettingsRead != nil {
		router.Method(http.MethodGet, "/api/admin/settings", configuration.AdminSettingsRead)
	}
	if configuration.AdminSettingsUpdate != nil {
		router.Method(http.MethodPut, "/api/admin/settings", configuration.AdminSettingsUpdate)
	}
	if configuration.AdminSettingsPublish != nil {
		router.Method(http.MethodPost, "/api/admin/settings/publish", configuration.AdminSettingsPublish)
	}
	if configuration.AdminMediaList != nil {
		router.Method(http.MethodGet, "/api/admin/media", configuration.AdminMediaList)
	}
	if configuration.AdminMediaUpload != nil {
		router.Method(http.MethodPost, "/api/admin/media/uploads", configuration.AdminMediaUpload)
	}
	if configuration.AdminMediaRetry != nil {
		router.Method(http.MethodPost, "/api/admin/media/{assetID}/upload", configuration.AdminMediaRetry)
	}
	if configuration.AdminMediaConfirm != nil {
		router.Method(http.MethodPost, "/api/admin/media/{assetID}/confirm", configuration.AdminMediaConfirm)
	}
	if configuration.AdminMediaUpdate != nil {
		router.Method(http.MethodPatch, "/api/admin/media/{assetID}", configuration.AdminMediaUpdate)
	}
	if configuration.AdminMediaDelete != nil {
		router.Method(http.MethodDelete, "/api/admin/media/{assetID}", configuration.AdminMediaDelete)
	}
	if configuration.MediaCallback != nil {
		router.Method(http.MethodPost, "/api/media/callbacks/cloudinary", configuration.MediaCallback)
	}
	if configuration.PublicServicesList != nil {
		router.Method(http.MethodGet, "/api/public/services", configuration.PublicServicesList)
	}
	if configuration.PublicServicesDetail != nil {
		router.Method(http.MethodGet, "/api/public/services/{slug}", configuration.PublicServicesDetail)
	}
	if configuration.PublicEnquirySubmit != nil {
		router.Method(http.MethodPost, "/api/public/enquiries", configuration.PublicEnquirySubmit)
	}
	if configuration.PublicEnquiryChallenge != nil {
		router.Method(http.MethodGet, "/api/public/enquiries/challenge", configuration.PublicEnquiryChallenge)
	}
	if configuration.PublicTicketOrderCreate != nil {
		router.Method(http.MethodPost, "/api/public/ticket-orders", configuration.PublicTicketOrderCreate)
	}
	if configuration.PublicTicketCheckout != nil {
		router.Method(http.MethodPost, "/api/public/ticket-orders/{reference}/checkout", configuration.PublicTicketCheckout)
	}
	if configuration.PublicTicketConfirmation != nil {
		router.Method(http.MethodGet, "/api/public/ticket-orders/{reference}", configuration.PublicTicketConfirmation)
	}
	if configuration.PaymentWebhook != nil {
		router.Method(http.MethodPost, "/api/webhooks/payments/{provider}", configuration.PaymentWebhook)
	}
	if configuration.PublicEvents != nil {
		router.Method(http.MethodGet, "/api/public/events", configuration.PublicEvents)
		router.Method(http.MethodGet, "/api/public/events/{slug}", configuration.PublicEvents)
	}
	if configuration.AdminServicesList != nil {
		router.Method(http.MethodGet, "/api/admin/services", configuration.AdminServicesList)
	}
	if configuration.AdminServicesCreate != nil {
		router.Method(http.MethodPost, "/api/admin/services", configuration.AdminServicesCreate)
	}
	if configuration.AdminServicesOrder != nil {
		router.Method(http.MethodPut, "/api/admin/services/order", configuration.AdminServicesOrder)
	}
	if configuration.AdminServicesUpdate != nil {
		router.Method(http.MethodPut, "/api/admin/services/{serviceID}", configuration.AdminServicesUpdate)
	}
	if configuration.AdminServicesActive != nil {
		router.Method(http.MethodPatch, "/api/admin/services/{serviceID}/active", configuration.AdminServicesActive)
	}
	if configuration.AdminServicesRetire != nil {
		router.Method(http.MethodDelete, "/api/admin/services/{serviceID}", configuration.AdminServicesRetire)
	}
	if configuration.PublicContentList != nil {
		router.Method(http.MethodGet, "/api/public/content/{kind}", configuration.PublicContentList)
	}
	if configuration.PublicContentDetail != nil {
		router.Method(http.MethodGet, "/api/public/content/{kind}/{slug}", configuration.PublicContentDetail)
	}
	// Public content carries bare asset ids, so the site needs a way to turn one
	// into a URL without a session. Without this route every CMS image and
	// social card resolved to nothing.
	if configuration.PublicMediaAsset != nil {
		router.Method(http.MethodGet, "/api/public/media/assets/{assetID}", configuration.PublicMediaAsset)
	}
	// The gallery page needs the ready gallery images without a session, same
	// fail-closed posture as the single-asset route above.
	if configuration.PublicMediaGallery != nil {
		router.Method(http.MethodGet, "/api/public/media/gallery", configuration.PublicMediaGallery)
	}
	if configuration.AdminContentList != nil {
		router.Method(http.MethodGet, "/api/admin/content/{kind}", configuration.AdminContentList)
	}
	if configuration.AdminContentCreate != nil {
		router.Method(http.MethodPost, "/api/admin/content/{kind}", configuration.AdminContentCreate)
	}
	if configuration.AdminContentPreview != nil {
		router.Method(http.MethodGet, "/api/admin/content/{kind}/{contentID}/preview", configuration.AdminContentPreview)
	}
	if configuration.AdminContentUpdate != nil {
		router.Method(http.MethodPut, "/api/admin/content/{kind}/{contentID}", configuration.AdminContentUpdate)
	}
	if configuration.AdminContentDelete != nil {
		router.Method(http.MethodDelete, "/api/admin/content/{kind}/{contentID}", configuration.AdminContentDelete)
	}
	if configuration.AdminContentApproval != nil {
		router.Method(http.MethodPatch, "/api/admin/content/{kind}/{contentID}/approval", configuration.AdminContentApproval)
	}
	if configuration.AdminContentPublish != nil {
		router.Method(http.MethodPatch, "/api/admin/content/{kind}/{contentID}/publication", configuration.AdminContentPublish)
	}
	if configuration.AdminVideosList != nil {
		router.Method(http.MethodGet, "/api/admin/videos", configuration.AdminVideosList)
	}
	if configuration.AdminVideosCreateUpload != nil {
		router.Method(http.MethodPost, "/api/admin/videos/uploads", configuration.AdminVideosCreateUpload)
	}
	if configuration.AdminVideosCreateLink != nil {
		router.Method(http.MethodPost, "/api/admin/videos/links", configuration.AdminVideosCreateLink)
	}
	if configuration.AdminVideosItem != nil {
		router.Method(http.MethodPatch, "/api/admin/videos/{videoID}", configuration.AdminVideosItem)
		router.Method(http.MethodDelete, "/api/admin/videos/{videoID}", configuration.AdminVideosItem)
	}
	if configuration.AdminVideosPublish != nil {
		router.Method(http.MethodPatch, "/api/admin/videos/{videoID}/publication", configuration.AdminVideosPublish)
	}
	if configuration.AdminVideosSync != nil {
		router.Method(http.MethodPost, "/api/admin/videos/{videoID}/sync", configuration.AdminVideosSync)
	}
	if configuration.AdminVideoCategoriesRead != nil {
		router.Method(http.MethodGet, "/api/admin/video-categories", configuration.AdminVideoCategoriesRead)
	}
	if configuration.AdminVideoCategoriesWrite != nil {
		router.Method(http.MethodPost, "/api/admin/video-categories", configuration.AdminVideoCategoriesWrite)
		router.Method(http.MethodPatch, "/api/admin/video-categories/{categoryID}", configuration.AdminVideoCategoriesWrite)
	}
	if configuration.VideoWebhook != nil {
		router.Method(http.MethodPost, "/api/webhooks/videos/bunny", configuration.VideoWebhook)
	}
	if configuration.PublicVideosList != nil {
		router.Method(http.MethodGet, "/api/public/videos", configuration.PublicVideosList)
	}
	if configuration.PublicVideoDetail != nil {
		router.Method(http.MethodGet, "/api/public/videos/{videoID}", configuration.PublicVideoDetail)
	}
	if configuration.AdminEventsRead != nil {
		router.Method(http.MethodGet, "/api/admin/events", configuration.AdminEventsRead)
		router.Method(http.MethodGet, "/api/admin/events/{eventID}/preview", configuration.AdminEventsRead)
	}
	if configuration.AdminEventsWrite != nil {
		router.Method(http.MethodPost, "/api/admin/events", configuration.AdminEventsWrite)
		router.Method(http.MethodPut, "/api/admin/events/{eventID}", configuration.AdminEventsWrite)
		router.Method(http.MethodPost, "/api/admin/events/{eventID}/publish", configuration.AdminEventsWrite)
		router.Method(http.MethodPost, "/api/admin/events/{eventID}/cancel", configuration.AdminEventsWrite)
		router.Method(http.MethodPost, "/api/admin/events/{eventID}/tickets", configuration.AdminEventsWrite)
		router.Method(http.MethodPut, "/api/admin/events/{eventID}/tickets/{ticketID}", configuration.AdminEventsWrite)
		router.Method(http.MethodPost, "/api/admin/events/{eventID}/tickets/{ticketID}/pause", configuration.AdminEventsWrite)
		router.Method(http.MethodPost, "/api/admin/events/{eventID}/tickets/{ticketID}/resume", configuration.AdminEventsWrite)
	}
	if configuration.AdminCRMWorkflow != nil {
		router.Method(http.MethodGet, "/api/admin/crm/enquiries/{id}/workflow", configuration.AdminCRMWorkflow)
		router.Method(http.MethodPost, "/api/admin/crm/enquiries/{id}/notes", configuration.AdminCRMWorkflow)
		router.Method(http.MethodPost, "/api/admin/crm/enquiries/{id}/tasks", configuration.AdminCRMWorkflow)
		router.Method(http.MethodPost, "/api/admin/crm/enquiries/{id}/tasks/{taskID}/complete", configuration.AdminCRMWorkflow)
		router.Method(http.MethodPost, "/api/admin/crm/enquiries/{id}/attachments", configuration.AdminCRMWorkflow)
		router.Method(http.MethodPost, "/api/admin/crm/enquiries/{id}/attachments/{attachmentID}/access", configuration.AdminCRMWorkflow)
		router.Method(http.MethodGet, "/api/admin/crm/enquiries/{id}/deliveries", configuration.AdminCRMWorkflow)
		router.Method(http.MethodPost, "/api/admin/crm/enquiries/{id}/deliveries/{deliveryID}/retry", configuration.AdminCRMWorkflow)
	}
	if configuration.AdminCRMProposalDownload != nil {
		router.Method(http.MethodGet, "/api/admin/crm/proposal-download", configuration.AdminCRMProposalDownload)
	}
	if configuration.AdminCRM != nil {
		router.Mount("/api/admin/crm", configuration.AdminCRM)
	}
	if configuration.AdminTicketDeadLetters != nil {
		router.Method(http.MethodGet, "/api/admin/ticket-deliveries/dead-letters", configuration.AdminTicketDeadLetters)
	}
	if configuration.AdminBookings != nil {
		router.Mount("/api/admin/bookings", configuration.AdminBookings)
	}
	if configuration.AdminCampaigns != nil {
		router.Mount("/api/admin/campaigns", configuration.AdminCampaigns)
	}
	if configuration.AdminTicketOps != nil {
		router.Mount("/api/admin/ticket-ops", configuration.AdminTicketOps)
	}
	if configuration.AdminExports != nil {
		router.Mount("/api/admin/exports", configuration.AdminExports)
	}
	if configuration.AdminAudit != nil {
		router.Mount("/api/admin/audit", configuration.AdminAudit)
	}
	if configuration.AdminAnalytics != nil {
		router.Mount("/api/admin/analytics", configuration.AdminAnalytics)
	}
	if configuration.AdminPrivacy != nil {
		router.Mount("/api/admin/privacy", configuration.AdminPrivacy)
	}
	if configuration.AdminSearch != nil {
		router.Mount("/api/admin/search", configuration.AdminSearch)
	}
	if configuration.AdminCheckin != nil {
		router.Mount("/api/admin/checkin", configuration.AdminCheckin)
	}
	if configuration.AdminTicketAnalytics != nil {
		router.Mount("/api/admin/ticket-analytics", configuration.AdminTicketAnalytics)
	}
	if configuration.PublicAnalyticsTrack != nil {
		router.Method(http.MethodPost, "/api/public/analytics/events", configuration.PublicAnalyticsTrack)
	}
	if configuration.PublicNewsletter != nil {
		router.Mount("/api/public/newsletter", configuration.PublicNewsletter)
	}
	if configuration.AdminNewsletter != nil {
		router.Mount("/api/admin/newsletter", configuration.AdminNewsletter)
	}
	if configuration.PublicSupport != nil {
		router.Mount("/api/public/support", configuration.PublicSupport)
	}
	if configuration.AdminSupport != nil {
		router.Mount("/api/admin/support", configuration.AdminSupport)
	}
	if configuration.PublicMerch != nil {
		router.Mount("/api/public/merch", configuration.PublicMerch)
	}
	if configuration.AdminMerch != nil {
		router.Mount("/api/admin/merch", configuration.AdminMerch)
	}
	return router
}

func health(status string, checks []ReadinessCheck) http.HandlerFunc {
	return func(response http.ResponseWriter, request *http.Request) {
		for _, check := range checks {
			if err := check(request.Context()); err != nil {
				writeProblem(response, http.StatusServiceUnavailable, "Service not ready")
				return
			}
		}
		writeJSON(response, http.StatusOK, healthResponse{Status: status})
	}
}

type contextKey string

const requestIDKey contextKey = "request_id"

var validRequestID = regexp.MustCompile(`^[A-Fa-f0-9]{32}$`)

func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		identifier := request.Header.Get("X-Request-ID")
		if !validRequestID.MatchString(identifier) {
			identifier = newRequestID()
		}
		response.Header().Set("X-Request-ID", identifier)
		ctx := context.WithValue(request.Context(), requestIDKey, identifier)
		next.ServeHTTP(response, request.WithContext(ctx))
	})
}

func newRequestID() string {
	data := make([]byte, 16)
	if _, err := rand.Read(data); err != nil {
		return fmt.Sprintf("fallback-%d", time.Now().UnixNano())
	}
	return fmt.Sprintf("%x", data)
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (recorder *statusRecorder) WriteHeader(status int) {
	recorder.status = status
	recorder.ResponseWriter.WriteHeader(status)
}

func accessLog(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			started := time.Now()
			recorder := &statusRecorder{ResponseWriter: response, status: http.StatusOK}
			next.ServeHTTP(recorder, request)
			logger.InfoContext(request.Context(), "http request",
				"request_id", request.Context().Value(requestIDKey),
				"method", request.Method,
				"route", chi.RouteContext(request.Context()).RoutePattern(),
				"status", recorder.status,
				"duration_ms", time.Since(started).Milliseconds(),
			)
		})
	}
}

func recoverer(options Options) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					// The recovered value is excluded because panic values can contain request data.
					_ = recovered
					err := errors.New("request panic")
					options.Logger.ErrorContext(request.Context(), "request panic recovered", "request_id", request.Context().Value(requestIDKey))
					if options.CapturePanic != nil {
						options.CapturePanic(err)
					}
					writeProblem(response, http.StatusInternalServerError, "Internal server error")
				}
			}()
			next.ServeHTTP(response, request)
		})
	}
}

func writeJSON(response http.ResponseWriter, status int, body any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(body)
}

func writeProblem(response http.ResponseWriter, status int, title string) {
	response.Header().Set("Content-Type", "application/problem+json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(problemResponse{Type: "about:blank", Title: title, Status: status})
}
