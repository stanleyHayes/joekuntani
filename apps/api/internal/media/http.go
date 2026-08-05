package media

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type ActorResolver func(*http.Request) (Actor, error)

type HTTPHandler struct {
	service *Service
	actor   ActorResolver
}

func NewHTTPHandler(service *Service, actor ActorResolver) (*HTTPHandler, error) {
	if service == nil || actor == nil {
		return nil, ErrInvalid
	}
	return &HTTPHandler{service: service, actor: actor}, nil
}

func (handler *HTTPHandler) Routes() http.Handler {
	router := chi.NewRouter()
	router.Get("/assets", handler.list)
	router.Post("/uploads", handler.requestUpload)
	router.Post("/callbacks/cloudinary", handler.completeUpload)
	router.Post("/assets/{assetID}/upload", handler.retryUpload)
	router.Patch("/assets/{assetID}", handler.update)
	router.Delete("/assets/{assetID}", handler.delete)
	return router
}
func (handler *HTTPHandler) ListHandler() http.Handler { return http.HandlerFunc(handler.list) }
func (handler *HTTPHandler) RequestUploadHandler() http.Handler {
	return http.HandlerFunc(handler.requestUpload)
}
func (handler *HTTPHandler) RetryUploadHandler() http.Handler {
	return http.HandlerFunc(handler.retryUpload)
}
func (handler *HTTPHandler) CallbackHandler() http.Handler {
	return http.HandlerFunc(handler.completeUpload)
}
func (handler *HTTPHandler) UpdateHandler() http.Handler { return http.HandlerFunc(handler.update) }
func (handler *HTTPHandler) DeleteHandler() http.Handler { return http.HandlerFunc(handler.delete) }
func (handler *HTTPHandler) retryUpload(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(response, request)
	if !ok {
		return
	}
	asset, signed, err := handler.service.RetryUpload(request.Context(), actor, chi.URLParam(request, "assetID"))
	if err != nil {
		if errors.Is(err, ErrProviderUnavailable) {
			mediaJSON(response, http.StatusServiceUnavailable, map[string]any{"asset": safeAsset(asset), "retryable": true})
			return
		}
		writeMediaError(response, err)
		return
	}
	mediaJSON(response, http.StatusOK, map[string]any{"asset": safeAsset(asset), "upload": signed})
}

type assetResponse struct {
	ID              string   `json:"id"`
	Filename        string   `json:"filename"`
	MIMEType        string   `json:"mime_type"`
	PublicURL       string   `json:"public_url"`
	Folder          string   `json:"folder"`
	AltText         string   `json:"alt_text"`
	Status          string   `json:"status"`
	Tags            []string `json:"tags"`
	Transformations []string `json:"transformations"`
	Bytes           int64    `json:"bytes"`
	Width           int      `json:"width"`
	Height          int      `json:"height"`
	ReferenceCount  int      `json:"reference_count"`
}

func safeAsset(asset Asset, referenceCount ...int) assetResponse {
	count := 0
	if len(referenceCount) > 0 {
		count = referenceCount[0]
	}
	return assetResponse{ID: asset.PublicID, Filename: asset.Filename, MIMEType: asset.MIMEType, PublicURL: asset.PublicURL, Folder: asset.Folder, AltText: asset.AltText, Status: string(asset.Status), Tags: asset.Tags, Transformations: asset.Transformations, Bytes: asset.Bytes, Width: asset.Width, Height: asset.Height, ReferenceCount: count}
}
func (handler *HTTPHandler) resolve(response http.ResponseWriter, request *http.Request) (Actor, bool) {
	actor, err := handler.actor(request)
	if err != nil {
		mediaProblem(response, http.StatusUnauthorized, "Authentication required")
		return Actor{}, false
	}
	return actor, true
}
func (handler *HTTPHandler) list(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(response, request)
	if !ok {
		return
	}
	assets, err := handler.service.List(request.Context(), actor)
	if err != nil {
		writeMediaError(response, err)
		return
	}
	result := make([]assetResponse, len(assets))
	for i, a := range assets {
		count, countErr := handler.service.UsageCount(request.Context(), actor, a.PublicID)
		if countErr != nil {
			writeMediaError(response, countErr)
			return
		}
		result[i] = safeAsset(a, count)
	}
	mediaJSON(response, http.StatusOK, map[string]any{"assets": result})
}
func (handler *HTTPHandler) requestUpload(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(response, request)
	if !ok {
		return
	}
	var input UploadRequest
	if !mediaDecode(response, request, &input) {
		return
	}
	asset, signed, err := handler.service.RequestUpload(request.Context(), actor, input)
	if err != nil {
		if errors.Is(err, ErrProviderUnavailable) {
			mediaJSON(response, http.StatusServiceUnavailable, map[string]any{"asset": safeAsset(asset), "retryable": true})
			return
		}
		writeMediaError(response, err)
		return
	}
	mediaJSON(response, http.StatusCreated, map[string]any{"asset": safeAsset(asset), "upload": signed})
}
func (handler *HTTPHandler) completeUpload(response http.ResponseWriter, request *http.Request) {
	if request.ContentLength == 0 || request.ContentLength > 64<<10 {
		mediaProblem(response, http.StatusBadRequest, "Invalid callback")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(response, request.Body, 64<<10))
	if err != nil || len(body) == 0 {
		mediaProblem(response, http.StatusBadRequest, "Invalid callback")
		return
	}
	headers := map[string]string{"signature": request.Header.Get("X-Media-Signature"), "timestamp": request.Header.Get("X-Media-Timestamp"), "event-id": request.Header.Get("X-Media-Event-ID")}
	if headers["signature"] == "" {
		headers["signature"] = request.Header.Get("X-Cld-Signature")
	}
	if headers["timestamp"] == "" {
		headers["timestamp"] = request.Header.Get("X-Cld-Timestamp")
	}
	if headers["event-id"] == "" {
		headers["event-id"] = headers["timestamp"] + ":" + headers["signature"]
	}
	_, err = handler.service.CompleteUpload(request.Context(), body, headers)
	if err != nil {
		writeMediaError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}

type metadataRequest struct {
	AltText         string   `json:"alt_text"`
	Tags            []string `json:"tags"`
	Transformations []string `json:"transformations"`
}

func (handler *HTTPHandler) update(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(response, request)
	if !ok {
		return
	}
	var input metadataRequest
	if !mediaDecode(response, request, &input) {
		return
	}
	asset, err := handler.service.UpdateMetadata(request.Context(), actor, chi.URLParam(request, "assetID"), input.AltText, input.Tags, input.Transformations)
	if err != nil {
		writeMediaError(response, err)
		return
	}
	mediaJSON(response, http.StatusOK, safeAsset(asset))
}
func (handler *HTTPHandler) delete(response http.ResponseWriter, request *http.Request) {
	actor, ok := handler.resolve(response, request)
	if !ok {
		return
	}
	if err := handler.service.Delete(request.Context(), actor, chi.URLParam(request, "assetID")); err != nil {
		writeMediaError(response, err)
		return
	}
	response.WriteHeader(http.StatusNoContent)
}
func mediaDecode(response http.ResponseWriter, request *http.Request, target any) bool {
	request.Body = http.MaxBytesReader(response, request.Body, 64<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		mediaProblem(response, http.StatusBadRequest, "Invalid request")
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		mediaProblem(response, http.StatusBadRequest, "Invalid request")
		return false
	}
	return true
}
func writeMediaError(response http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrForbidden):
		mediaProblem(response, http.StatusForbidden, "Access denied")
	case errors.Is(err, ErrNotFound):
		mediaProblem(response, http.StatusNotFound, "Asset not found")
	case errors.Is(err, ErrReferenced), errors.Is(err, ErrConflict), errors.Is(err, ErrReplay):
		mediaProblem(response, http.StatusConflict, "Asset conflict")
	case errors.Is(err, ErrProviderUnavailable), errors.Is(err, ErrAuditUnavailable):
		mediaProblem(response, http.StatusServiceUnavailable, "Media temporarily unavailable")
	case errors.Is(err, ErrInvalidSignature):
		mediaProblem(response, http.StatusUnauthorized, "Callback rejected")
	default:
		mediaProblem(response, http.StatusBadRequest, "Invalid media request")
	}
}
func mediaJSON(response http.ResponseWriter, status int, value any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(value)
}
func mediaProblem(response http.ResponseWriter, status int, title string) {
	response.Header().Set("Content-Type", "application/problem+json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]any{"type": "about:blank", "title": title, "status": status})
}
