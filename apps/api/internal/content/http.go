package content

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type ActorResolver func(*http.Request) (Actor, bool)
type HTTPHandler struct {
	domain *Domain
	actor  ActorResolver
}

func NewHTTPHandler(domain *Domain, actor ActorResolver) *HTTPHandler {
	return &HTTPHandler{domain: domain, actor: actor}
}
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
func (handler *HTTPHandler) AdminDeleteHandler() http.Handler {
	return http.HandlerFunc(handler.delete)
}
func (handler *HTTPHandler) AdminPreviewHandler() http.Handler {
	return http.HandlerFunc(handler.preview)
}
func (handler *HTTPHandler) AdminApprovalHandler() http.Handler {
	return http.HandlerFunc(handler.approve)
}
func (handler *HTTPHandler) AdminPublicationHandler() http.Handler {
	return http.HandlerFunc(handler.publication)
}

func (handler *HTTPHandler) PublicRoutes() http.Handler {
	router := chi.NewRouter()
	router.Get("/{kind}", handler.publicList)
	router.Get("/{kind}/{slug}", handler.publicDetail)
	return router
}
func (handler *HTTPHandler) AdminRoutes() http.Handler {
	router := chi.NewRouter()
	router.Get("/{kind}", handler.adminList)
	router.Post("/{kind}", handler.create)
	router.Get("/{kind}/{id}/preview", handler.preview)
	router.Put("/{kind}/{id}", handler.update)
	router.Delete("/{kind}/{id}", handler.delete)
	router.Patch("/{kind}/{id}/approval", handler.approve)
	router.Patch("/{kind}/{id}/publication", handler.publication)
	return router
}

func queryFrom(request *http.Request) (Query, error) {
	kind := Kind(chi.URLParam(request, "kind"))
	if !validKind(kind) {
		return Query{}, ErrInvalid
	}
	return Query{Kind: kind, Category: strings.TrimSpace(request.URL.Query().Get("category")), Tag: strings.TrimSpace(request.URL.Query().Get("tag")), FeaturedOnly: request.URL.Query().Get("featured") == "true"}, nil
}
func (handler *HTTPHandler) publicList(response http.ResponseWriter, request *http.Request) {
	query, err := queryFrom(request)
	if err != nil {
		problem(response, http.StatusNotFound, "Content type not found")
		return
	}
	items, err := handler.domain.Public(request.Context(), query)
	if err != nil {
		problem(response, http.StatusServiceUnavailable, "Content unavailable")
		return
	}
	jsonResponse(response, http.StatusOK, map[string]any{"items": items})
}
func (handler *HTTPHandler) publicDetail(response http.ResponseWriter, request *http.Request) {
	item, err := handler.domain.PublicBySlug(request.Context(), Kind(chi.URLParam(request, "kind")), chi.URLParam(request, "slug"))
	if err != nil {
		problem(response, http.StatusNotFound, "Content not found")
		return
	}
	jsonResponse(response, http.StatusOK, item)
}
func (handler *HTTPHandler) adminList(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	query, err := queryFrom(request)
	if err != nil {
		problem(response, http.StatusNotFound, "Content type not found")
		return
	}
	items, err := handler.domain.All(request.Context(), actor, query)
	if err != nil {
		handler.domainProblem(response, err)
		return
	}
	jsonResponse(response, http.StatusOK, map[string]any{"items": items})
}
func (handler *HTTPHandler) preview(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	item, err := handler.domain.Preview(request.Context(), actor, contentID(request))
	if err != nil || item.Kind != Kind(chi.URLParam(request, "kind")) {
		handler.domainProblem(response, ErrNotFound)
		return
	}
	response.Header().Set("Cache-Control", "private, no-store")
	response.Header().Set("X-Robots-Tag", "noindex, nofollow")
	jsonResponse(response, http.StatusOK, item)
}

type contentRequest struct {
	Revision        int64     `json:"revision"`
	Slug            string    `json:"slug"`
	Title           string    `json:"title"`
	Summary         string    `json:"summary"`
	Body            string    `json:"body"`
	Category        string    `json:"category"`
	Tags            []string  `json:"tags"`
	Featured        bool      `json:"featured"`
	GalleryAssetIDs []string  `json:"gallery_asset_ids"`
	Results         []Result  `json:"results"`
	Sections        []Section `json:"sections"`
	ExternalURL     string    `json:"external_url"`
	EmbedURL        string    `json:"embed_url"`
	Outlet          string    `json:"outlet"`
	PersonName      string    `json:"person_name"`
	PersonTitle     string    `json:"person_title"`
	Organization    string    `json:"organization"`
	SEO             SEO       `json:"seo"`
}

func (input contentRequest) domainInput(kind Kind) Input {
	return Input{Kind: kind, Slug: input.Slug, Title: input.Title, Summary: input.Summary, Body: input.Body, Category: input.Category, Tags: input.Tags, Featured: input.Featured, GalleryAssetIDs: input.GalleryAssetIDs, Results: input.Results, Sections: input.Sections, ExternalURL: input.ExternalURL, EmbedURL: input.EmbedURL, Outlet: input.Outlet, PersonName: input.PersonName, PersonTitle: input.PersonTitle, Organization: input.Organization, SEO: input.SEO}
}
func (handler *HTTPHandler) create(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	var input contentRequest
	if !decodeJSON(response, request, &input) {
		return
	}
	item, err := handler.domain.Create(request.Context(), actor, input.domainInput(Kind(chi.URLParam(request, "kind"))))
	if err != nil {
		handler.domainProblem(response, err)
		return
	}
	response.Header().Set("Location", "/api/admin/content/"+string(item.Kind)+"/"+item.PublicID)
	jsonResponse(response, http.StatusCreated, item)
}
func (handler *HTTPHandler) update(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	var input contentRequest
	if !decodeJSON(response, request, &input) {
		return
	}
	if input.Revision < 1 {
		handler.domainProblem(response, ErrConflict)
		return
	}
	if !handler.matchesKind(request, actor) {
		handler.domainProblem(response, ErrNotFound)
		return
	}
	item, err := handler.domain.Update(request.Context(), actor, contentID(request), input.Revision, input.domainInput(Kind(chi.URLParam(request, "kind"))))
	if err != nil || item.Kind != Kind(chi.URLParam(request, "kind")) {
		if err == nil {
			err = ErrNotFound
		}
		handler.domainProblem(response, err)
		return
	}
	jsonResponse(response, http.StatusOK, item)
}
func (handler *HTTPHandler) delete(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	preview, err := handler.domain.Preview(request.Context(), actor, contentID(request))
	if err != nil || preview.Kind != Kind(chi.URLParam(request, "kind")) {
		handler.domainProblem(response, ErrNotFound)
		return
	}
	revision, parseErr := strconv.ParseInt(request.URL.Query().Get("revision"), 10, 64)
	if parseErr != nil {
		handler.domainProblem(response, ErrInvalid)
		return
	}
	if err = handler.domain.Delete(request.Context(), actor, preview.PublicID, revision); err != nil {
		handler.domainProblem(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

type approvalRequest struct {
	Approved bool  `json:"approved"`
	Revision int64 `json:"revision"`
}

func (handler *HTTPHandler) approve(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	var input approvalRequest
	if !decodeJSON(response, request, &input) {
		return
	}
	if !handler.matchesKind(request, actor) {
		handler.domainProblem(response, ErrNotFound)
		return
	}
	item, err := handler.domain.Approve(request.Context(), actor, contentID(request), input.Revision, input.Approved)
	if err != nil || item.Kind != Kind(chi.URLParam(request, "kind")) {
		if err == nil {
			err = ErrNotFound
		}
		handler.domainProblem(response, err)
		return
	}
	jsonResponse(response, http.StatusOK, item)
}

type publicationRequest struct {
	Action      string `json:"action"`
	PublishAt   string `json:"publish_at"`
	UnpublishAt string `json:"unpublish_at"`
	Revision    int64  `json:"revision"`
}

func (handler *HTTPHandler) publication(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(request)
	if !ok {
		problem(response, http.StatusForbidden, "Access denied")
		return
	}
	var input publicationRequest
	if !decodeJSON(response, request, &input) {
		return
	}
	if !handler.matchesKind(request, actor) {
		handler.domainProblem(response, ErrNotFound)
		return
	}
	unpublishAt, valid := optionalTime(input.UnpublishAt)
	if !valid {
		handler.domainProblem(response, ErrInvalid)
		return
	}
	var item Item
	var err error
	switch input.Action {
	case "publish":
		item, err = handler.domain.Publish(request.Context(), actor, contentID(request), input.Revision, unpublishAt)
	case "schedule":
		var publishAt time.Time
		publishAt, err = time.Parse(time.RFC3339, input.PublishAt)
		if err == nil {
			item, err = handler.domain.Schedule(request.Context(), actor, contentID(request), input.Revision, publishAt, unpublishAt)
		}
	case "unpublish":
		item, err = handler.domain.Unpublish(request.Context(), actor, contentID(request), input.Revision)
	default:
		err = ErrInvalid
	}
	if err != nil || item.Kind != Kind(chi.URLParam(request, "kind")) {
		if err == nil {
			err = ErrNotFound
		}
		handler.domainProblem(response, err)
		return
	}
	jsonResponse(response, http.StatusOK, item)
}

func (handler *HTTPHandler) matchesKind(request *http.Request, actor Actor) bool {
	item, err := handler.domain.Preview(request.Context(), actor, contentID(request))
	return err == nil && item.Kind == Kind(chi.URLParam(request, "kind"))
}
func contentID(request *http.Request) string {
	if value := chi.URLParam(request, "contentID"); value != "" {
		return value
	}
	return chi.URLParam(request, "id")
}
func optionalTime(value string) (*time.Time, bool) {
	if value == "" {
		return nil, true
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil, false
	}
	return &parsed, true
}
func (handler *HTTPHandler) resolve(request *http.Request) (Actor, bool) {
	if handler.actor == nil {
		return Actor{}, false
	}
	return handler.actor(request)
}
func (handler *HTTPHandler) domainProblem(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInvalid):
		problem(response, http.StatusUnprocessableEntity, "Content data is invalid")
	case errors.Is(err, ErrForbidden):
		problem(response, http.StatusForbidden, "Access denied")
	case errors.Is(err, ErrNotFound):
		problem(response, http.StatusNotFound, "Content not found")
	case errors.Is(err, ErrConflict):
		problem(response, http.StatusConflict, "Content conflicts with its publication state or immutable identity")
	default:
		problem(response, http.StatusInternalServerError, "Unable to manage content")
	}
}
func decodeJSON(response http.ResponseWriter, request *http.Request, target any) bool {
	if !strings.HasPrefix(strings.ToLower(request.Header.Get("Content-Type")), "application/json") {
		problem(response, http.StatusUnsupportedMediaType, "JSON content required")
		return false
	}
	request.Body = http.MaxBytesReader(response, request.Body, 128<<10)
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
