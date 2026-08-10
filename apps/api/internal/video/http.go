package video

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

type ActorResolver func(*http.Request) (Actor, error)
type HTTPHandler struct {
	service       *Service
	actor         ActorResolver
	webhookSecret string
}

func NewHTTPHandler(service *Service, actor ActorResolver, webhookSecret string) (*HTTPHandler, error) {
	if service == nil || actor == nil {
		return nil, ErrInvalid
	}
	return &HTTPHandler{service: service, actor: actor, webhookSecret: webhookSecret}, nil
}

func (handler *HTTPHandler) AdminList() http.Handler { return http.HandlerFunc(handler.list) }
func (handler *HTTPHandler) AdminCreateUpload() http.Handler {
	return http.HandlerFunc(handler.createUpload)
}
func (handler *HTTPHandler) AdminItem() http.Handler    { return http.HandlerFunc(handler.item) }
func (handler *HTTPHandler) AdminPublish() http.Handler { return http.HandlerFunc(handler.publish) }
func (handler *HTTPHandler) AdminSync() http.Handler    { return http.HandlerFunc(handler.sync) }
func (handler *HTTPHandler) Webhook() http.Handler      { return http.HandlerFunc(handler.webhook) }
func (handler *HTTPHandler) PublicList() http.Handler   { return http.HandlerFunc(handler.publicList) }
func (handler *HTTPHandler) PublicItem() http.Handler   { return http.HandlerFunc(handler.publicItem) }

type itemResponse struct {
	ID              string        `json:"id"`
	Slug            string        `json:"slug"`
	Title           string        `json:"title"`
	Description     string        `json:"description"`
	Category        string        `json:"category"`
	Tags            []string      `json:"tags"`
	Provider        string        `json:"provider"`
	ThumbnailURL    string        `json:"thumbnail_url"`
	DurationSeconds int           `json:"duration_seconds"`
	Status          Status        `json:"status"`
	Visibility      Visibility    `json:"visibility"`
	Published       bool          `json:"is_published"`
	PublishedAt     *time.Time    `json:"published_at,omitempty"`
	SortOrder       int           `json:"sort_order"`
	Filename        string        `json:"filename"`
	MIMEType        string        `json:"mime_type"`
	Bytes           int64         `json:"bytes"`
	FailureReason   string        `json:"failure_reason,omitempty"`
	Revision        int64         `json:"revision"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
	Playback        *PlaybackInfo `json:"playback,omitempty"`
}

type publicVideoResponse struct {
	ID              string       `json:"id"`
	Slug            string       `json:"slug"`
	Title           string       `json:"title"`
	Description     string       `json:"description"`
	Category        string       `json:"category"`
	Tags            []string     `json:"tags"`
	ThumbnailURL    string       `json:"thumbnail_url"`
	DurationSeconds int          `json:"duration_seconds"`
	Status          Status       `json:"status"`
	Visibility      Visibility   `json:"visibility"`
	Published       bool         `json:"is_published"`
	PublishedAt     *time.Time   `json:"published_at,omitempty"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
	Playback        PlaybackInfo `json:"playback"`
}

func publicResponseFor(item Item, playback PlaybackInfo) publicVideoResponse {
	thumbnailURL := item.ThumbnailURL
	if thumbnailURL == "" {
		thumbnailURL = playback.ThumbnailURL
	}
	return publicVideoResponse{ID: item.PublicID, Slug: item.Slug, Title: item.Title, Description: item.Description, Category: item.Category, Tags: emptyStrings(item.Tags), ThumbnailURL: thumbnailURL, DurationSeconds: item.DurationSeconds, Status: item.Status, Visibility: item.Visibility, Published: item.Published, PublishedAt: item.PublishedAt, CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt, Playback: playback}
}

func responseFor(item Item, playback ...PlaybackInfo) itemResponse {
	result := itemResponse{ID: item.PublicID, Slug: item.Slug, Title: item.Title, Description: item.Description, Category: item.Category, Tags: emptyStrings(item.Tags), Provider: item.Provider, ThumbnailURL: item.ThumbnailURL, DurationSeconds: item.DurationSeconds, Status: item.Status, Visibility: item.Visibility, Published: item.Published, PublishedAt: item.PublishedAt, SortOrder: item.SortOrder, Filename: item.Filename, MIMEType: item.MIMEType, Bytes: item.Bytes, FailureReason: item.FailureReason, Revision: item.Revision, CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt}
	if len(playback) > 0 {
		result.Playback = &playback[0]
	}
	return result
}

func (handler *HTTPHandler) resolve(response http.ResponseWriter, request *http.Request) (Actor, bool) {
	actor, err := handler.actor(request)
	if err != nil {
		problem(response, http.StatusUnauthorized, "Authentication required")
		return Actor{}, false
	}
	return actor, true
}
func (handler *HTTPHandler) list(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(response, request)
	if !ok {
		return
	}
	items, err := handler.service.List(request.Context(), actor)
	if err != nil {
		writeError(response, err)
		return
	}
	result := make([]itemResponse, len(items))
	for i, item := range items {
		result[i] = responseFor(item, handler.service.provider.Playback(item.ProviderVideoID))
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": result})
}
func (handler *HTTPHandler) publicList(response http.ResponseWriter, request *http.Request) {
	items, err := handler.service.PublicList(request.Context())
	if err != nil {
		writeError(response, err)
		return
	}
	result := make([]publicVideoResponse, len(items))
	for i, item := range items {
		playback := handler.service.provider.Playback(item.ProviderVideoID)
		result[i] = publicResponseFor(item, playback)
	}
	writeJSON(response, http.StatusOK, map[string]any{"items": result})
}
func (handler *HTTPHandler) publicItem(response http.ResponseWriter, request *http.Request) {
	item, playback, err := handler.service.Public(request.Context(), chi.URLParam(request, "videoID"))
	if err != nil {
		writeError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, publicResponseFor(item, playback))
}
func (handler *HTTPHandler) createUpload(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(response, request)
	if !ok {
		return
	}
	var input CreateInput
	if !decode(response, request, &input) {
		return
	}
	item, authorization, err := handler.service.CreateUpload(request.Context(), actor, input)
	if err != nil {
		writeError(response, err)
		return
	}
	writeJSON(response, http.StatusCreated, map[string]any{"item": responseFor(item, handler.service.provider.Playback(item.ProviderVideoID)), "upload": authorization})
}
func (handler *HTTPHandler) item(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(response, request)
	if !ok {
		return
	}
	id := chi.URLParam(request, "videoID")
	switch request.Method {
	case http.MethodPatch:
		var input UpdateInput
		if !decode(response, request, &input) {
			return
		}
		item, err := handler.service.Update(request.Context(), actor, id, input)
		if err != nil {
			writeError(response, err)
			return
		}
		writeJSON(response, http.StatusOK, responseFor(item, handler.service.provider.Playback(item.ProviderVideoID)))
	case http.MethodDelete:
		revision, err := strconv.ParseInt(request.URL.Query().Get("revision"), 10, 64)
		if err != nil {
			writeError(response, ErrInvalid)
			return
		}
		if err = handler.service.Delete(request.Context(), actor, id, revision); err != nil {
			writeError(response, err)
			return
		}
		response.WriteHeader(http.StatusNoContent)
	default:
		response.WriteHeader(http.StatusMethodNotAllowed)
	}
}
func (handler *HTTPHandler) publish(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(response, request)
	if !ok {
		return
	}
	var input struct {
		Published bool  `json:"published"`
		Revision  int64 `json:"revision"`
	}
	if !decode(response, request, &input) {
		return
	}
	item, err := handler.service.Publish(request.Context(), actor, chi.URLParam(request, "videoID"), input.Published, input.Revision)
	if err != nil {
		writeError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, responseFor(item, handler.service.provider.Playback(item.ProviderVideoID)))
}
func (handler *HTTPHandler) sync(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(response, request)
	if !ok {
		return
	}
	item, err := handler.service.Synchronize(request.Context(), actor, chi.URLParam(request, "videoID"))
	if err != nil {
		writeError(response, err)
		return
	}
	writeJSON(response, http.StatusOK, responseFor(item, handler.service.provider.Playback(item.ProviderVideoID)))
}
func (handler *HTTPHandler) webhook(response http.ResponseWriter, request *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(response, request.Body, 64<<10))
	if err != nil || len(body) == 0 {
		writeError(response, ErrInvalid)
		return
	}
	headers := map[string]string{"version": request.Header.Get("X-BunnyStream-Signature-Version"), "algorithm": request.Header.Get("X-BunnyStream-Signature-Algorithm"), "signature": request.Header.Get("X-BunnyStream-Signature")}
	if err = handler.service.ApplyWebhook(request.Context(), body, headers, handler.webhookSecret); err != nil {
		writeError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}
func decode(response http.ResponseWriter, request *http.Request, target any) bool {
	request.Body = http.MaxBytesReader(response, request.Body, 64<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		problem(response, http.StatusBadRequest, "Invalid request")
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		problem(response, http.StatusBadRequest, "Invalid request")
		return false
	}
	return true
}
func writeError(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrForbidden):
		problem(response, http.StatusForbidden, "Access denied")
	case errors.Is(err, ErrNotFound):
		problem(response, http.StatusNotFound, "Video not found")
	case errors.Is(err, ErrConflict):
		problem(response, http.StatusConflict, "Video state conflict")
	case errors.Is(err, ErrProviderUnavailable):
		problem(response, http.StatusServiceUnavailable, "Video provider unavailable")
	case errors.Is(err, ErrInvalidSignature):
		problem(response, http.StatusUnauthorized, "Webhook rejected")
	default:
		problem(response, http.StatusUnprocessableEntity, "Invalid video request")
	}
}
func writeJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(value)
}
func problem(response http.ResponseWriter, status int, title string) {
	response.Header().Set("Content-Type", "application/problem+json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
