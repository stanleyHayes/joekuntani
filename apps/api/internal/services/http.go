package services

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

type ActorResolver func(*http.Request) (Actor, bool)
type Telemetry interface{ ServiceViewed(string) }

type HTTPHandler struct {
	domain    *Domain
	actor     ActorResolver
	telemetry Telemetry
}

func NewHTTPHandler(domain *Domain, actor ActorResolver, telemetry Telemetry) *HTTPHandler {
	return &HTTPHandler{domain: domain, actor: actor, telemetry: telemetry}
}

// Endpoint accessors let shared API composition apply authentication to reads
// and authentication plus CSRF to mutations independently. The domain repeats
// the content-edit authorization check after the actor is resolved.
func (handler *HTTPHandler) PublicListHandler() http.Handler {
	return http.HandlerFunc(handler.publicList)
}

func (handler *HTTPHandler) PublicDetailHandler() http.Handler {
	return http.HandlerFunc(handler.publicDetail)
}

func (handler *HTTPHandler) AdminListHandler() http.Handler {
	return http.HandlerFunc(handler.adminList)
}

func (handler *HTTPHandler) AdminCreateHandler() http.Handler {
	return http.HandlerFunc(handler.create)
}

func (handler *HTTPHandler) AdminUpdateHandler() http.Handler {
	return http.HandlerFunc(handler.update)
}

func (handler *HTTPHandler) AdminActiveHandler() http.Handler {
	return http.HandlerFunc(handler.setActive)
}

func (handler *HTTPHandler) AdminOrderHandler() http.Handler {
	return http.HandlerFunc(handler.reorder)
}

func (handler *HTTPHandler) AdminRetireHandler() http.Handler {
	return http.HandlerFunc(handler.retire)
}

func (handler *HTTPHandler) PublicRoutes() http.Handler {
	router := chi.NewRouter()
	router.Get("/", handler.publicList)
	router.Get("/{slug}", handler.publicDetail)
	return router
}

// AdminRoutes contains field-level authorization in addition to the session,
// CSRF and permission middleware applied by API composition.
func (handler *HTTPHandler) AdminRoutes() http.Handler {
	router := chi.NewRouter()
	router.Get("/", handler.adminList)
	router.Post("/", handler.create)
	router.Put("/order", handler.reorder)
	router.Put("/{id}", handler.update)
	router.Patch("/{id}/active", handler.setActive)
	router.Delete("/{id}", handler.retire)
	return router
}

func (handler *HTTPHandler) publicList(response http.ResponseWriter, request *http.Request) {
	items, err := handler.domain.Public(request.Context())
	if err != nil {
		problem(response, http.StatusServiceUnavailable, "Services unavailable")
		return
	}
	jsonResponse(response, http.StatusOK, map[string]any{"items": items})
}

func (handler *HTTPHandler) publicDetail(response http.ResponseWriter, request *http.Request) {
	slug := chi.URLParam(request, "slug")
	item, err := handler.domain.BySlug(request.Context(), slug)
	if err != nil {
		problem(response, http.StatusNotFound, "Service not found")
		return
	}
	if handler.telemetry != nil {
		handler.telemetry.ServiceViewed(item.Slug)
	}
	jsonResponse(response, http.StatusOK, item)
}

func (handler *HTTPHandler) adminList(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolveActor(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	items, err := handler.domain.All(request.Context(), actor)
	if err != nil {
		handler.domainProblem(response, err)
		return
	}
	jsonResponse(response, http.StatusOK, map[string]any{"items": items})
}

type serviceRequest struct {
	Name        string     `json:"name"`
	Summary     string     `json:"summary"`
	Description string     `json:"description"`
	Category    string     `json:"category"`
	Active      bool       `json:"active"`
	SortOrder   int        `json:"sort_order"`
	FormSchema  FormSchema `json:"form_schema"`
	CTA         CTA        `json:"cta"`
}

type updateServiceRequest struct {
	serviceRequest
	Version int64 `json:"version"`
}

func (input serviceRequest) domainInput() Input {
	return Input(input)
}

func (handler *HTTPHandler) create(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolveActor(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	var input serviceRequest
	if !decodeJSON(response, request, &input) {
		return
	}
	item, err := handler.domain.Create(request.Context(), actor, input.domainInput())
	if err != nil {
		handler.domainProblem(response, err)
		return
	}
	response.Header().Set("Location", "/api/v1/services/"+item.Slug)
	jsonResponse(response, http.StatusCreated, item)
}

func (handler *HTTPHandler) update(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolveActor(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	var input updateServiceRequest
	if !decodeJSON(response, request, &input) {
		return
	}
	item, err := handler.domain.Update(request.Context(), actor, serviceID(request), input.Version, input.serviceRequest.domainInput())
	if err != nil {
		handler.domainProblem(response, err)
		return
	}
	jsonResponse(response, http.StatusOK, item)
}

type activeRequest struct {
	Active  bool  `json:"active"`
	Version int64 `json:"version"`
}

func (handler *HTTPHandler) setActive(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolveActor(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	var input activeRequest
	if !decodeJSON(response, request, &input) {
		return
	}
	if err := handler.domain.SetActive(request.Context(), actor, serviceID(request), input.Active, input.Version); err != nil {
		handler.domainProblem(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

type reorderRequest struct {
	Items []OrderItem `json:"items"`
}

func (handler *HTTPHandler) reorder(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolveActor(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	var input reorderRequest
	if !decodeJSON(response, request, &input) {
		return
	}
	if err := handler.domain.Reorder(request.Context(), actor, input.Items); err != nil {
		handler.domainProblem(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

func (handler *HTTPHandler) retire(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolveActor(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	version, err := expectedVersion(request.Header.Get("If-Match"))
	if err != nil {
		problem(response, http.StatusUnprocessableEntity, "A valid If-Match service version is required")
		return
	}
	item, err := handler.domain.Retire(request.Context(), actor, serviceID(request), version)
	if err != nil {
		handler.domainProblem(response, err)
		return
	}
	jsonResponse(response, http.StatusOK, item)
}

func expectedVersion(value string) (int64, error) {
	value = strings.Trim(strings.TrimSpace(value), `"`)
	version, err := strconv.ParseInt(value, 10, 64)
	if err != nil || version < 1 {
		return 0, ErrInvalid
	}
	return version, nil
}

func (handler *HTTPHandler) resolveActor(request *http.Request) (Actor, bool) {
	if handler.actor == nil {
		return Actor{}, false
	}
	return handler.actor(request)
}

func serviceID(request *http.Request) string {
	if id := chi.URLParam(request, "serviceID"); id != "" {
		return id
	}
	return chi.URLParam(request, "id")
}

func (handler *HTTPHandler) domainProblem(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInvalid):
		problem(response, http.StatusUnprocessableEntity, "Service data is invalid")
	case errors.Is(err, ErrForbidden):
		problem(response, http.StatusForbidden, "Access denied")
	case errors.Is(err, ErrNotFound):
		problem(response, http.StatusNotFound, "Service not found")
	case errors.Is(err, ErrConflict):
		problem(response, http.StatusConflict, "Service conflicts with existing data")
	default:
		problem(response, http.StatusInternalServerError, "Unable to manage services")
	}
}

func decodeJSON(response http.ResponseWriter, request *http.Request, target any) bool {
	if !strings.HasPrefix(strings.ToLower(request.Header.Get("Content-Type")), "application/json") {
		problem(response, http.StatusUnsupportedMediaType, "JSON content required")
		return false
	}
	request.Body = http.MaxBytesReader(response, request.Body, 64<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil || decoder.Decode(&struct{}{}) == nil {
		problem(response, http.StatusBadRequest, "Invalid request")
		return false
	}
	return true
}

func jsonResponse(response http.ResponseWriter, status int, body any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(body)
}

func problem(response http.ResponseWriter, status int, title string) {
	response.Header().Set("Content-Type", "application/problem+json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
