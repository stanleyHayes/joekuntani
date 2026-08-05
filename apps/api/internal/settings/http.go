package settings

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

type HTTPHandler struct {
	service *Service
	auth    *auth.HTTPHandler
	secrets SecretStatus
}

func NewHTTPHandler(service *Service, authHandler *auth.HTTPHandler) *HTTPHandler {
	return &HTTPHandler{service: service, auth: authHandler, secrets: SecretStatus{EmailConfigured: os.Getenv("RESEND_API_KEY") != "", MediaConfigured: os.Getenv("CLOUDINARY_API_SECRET") != "", AnalyticsConfigured: os.Getenv("NEXT_PUBLIC_POSTHOG_KEY") != "", PaymentConfigured: os.Getenv("PAYMENT_PROVIDER_SECRET") != ""}}
}
func (handler *HTTPHandler) Public() http.Handler { return http.HandlerFunc(handler.public) }
func (handler *HTTPHandler) AdminRead() http.Handler {
	return handler.auth.Protect(auth.PermissionSettingsEdit, false, http.HandlerFunc(handler.adminRead))
}
func (handler *HTTPHandler) AdminUpdate() http.Handler {
	return handler.auth.Protect(auth.PermissionSettingsEdit, true, http.HandlerFunc(handler.adminUpdate))
}
func (handler *HTTPHandler) AdminPublish() http.Handler {
	return handler.auth.Protect(auth.PermissionSettingsManage, true, http.HandlerFunc(handler.publish))
}

func (handler *HTTPHandler) public(response http.ResponseWriter, request *http.Request) {
	value, err := handler.service.GetPublic(request.Context())
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
		}
		writeProblem(response, status, "Public settings unavailable")
		return
	}
	writeJSON(response, http.StatusOK, value)
}
func (handler *HTTPHandler) adminRead(response http.ResponseWriter, request *http.Request) {
	actor, _ := auth.PrincipalFromContext(request.Context())
	value, err := handler.service.GetAdmin(request.Context(), actor)
	if err != nil {
		handler.error(response, err)
		return
	}
	body := struct {
		Document
		Secrets   SecretStatus `json:"secret_status"`
		CanManage bool         `json:"can_manage"`
	}{Document: value, Secrets: handler.secrets, CanManage: actor.Role == auth.RoleAdministrator}
	writeJSON(response, http.StatusOK, body)
}

type updateRequest struct {
	Version         int64  `json:"version"`
	Values          Values `json:"values"`
	ContentComplete bool   `json:"content_complete"`
}

func (handler *HTTPHandler) adminUpdate(response http.ResponseWriter, request *http.Request) {
	var input updateRequest
	if !decode(response, request, &input) {
		return
	}
	actor, _ := auth.PrincipalFromContext(request.Context())
	value, err := handler.service.Update(request.Context(), actor, input.Version, input.Values, input.ContentComplete)
	if err != nil {
		handler.error(response, err)
		return
	}
	response.Header().Set("ETag", strconv.FormatInt(value.Version, 10))
	writeJSON(response, http.StatusOK, value)
}

type publishRequest struct {
	Version int64 `json:"version"`
}

func (handler *HTTPHandler) publish(response http.ResponseWriter, request *http.Request) {
	var input publishRequest
	if !decode(response, request, &input) {
		return
	}
	actor, _ := auth.PrincipalFromContext(request.Context())
	value, err := handler.service.Publish(request.Context(), actor, input.Version)
	if err != nil {
		handler.error(response, err)
		return
	}
	response.Header().Set("ETag", strconv.FormatInt(value.Version, 10))
	writeJSON(response, http.StatusOK, value)
}
func (handler *HTTPHandler) error(response http.ResponseWriter, err error) {
	status, title := http.StatusUnprocessableEntity, "Settings validation failed"
	switch {
	case errors.Is(err, ErrForbidden):
		status, title = http.StatusForbidden, "Access denied"
	case errors.Is(err, ErrConflict):
		status, title = http.StatusConflict, "Settings changed; reload and try again"
	case errors.Is(err, ErrNotFound):
		status, title = http.StatusNotFound, "Settings not found"
	}
	writeProblem(response, status, title)
}
func decode(response http.ResponseWriter, request *http.Request, target any) bool {
	request.Body = http.MaxBytesReader(response, request.Body, 128<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeProblem(response, http.StatusBadRequest, "Invalid request")
		return false
	}
	if decoder.Decode(&struct{}{}) == nil {
		writeProblem(response, http.StatusBadRequest, "Invalid request")
		return false
	}
	return true
}
func writeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(value)
}
func writeProblem(response http.ResponseWriter, status int, title string) {
	response.Header().Set("Content-Type", "application/problem+json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
