package media

import (
	"context"
	"errors"
	"time"
)

type Status string

const (
	StatusDraft     Status = "draft"
	StatusUploading Status = "uploading"
	StatusReady     Status = "ready"
	StatusFailed    Status = "failed"
	StatusDeleting  Status = "deleting"
	StatusDeleted   Status = "deleted"
)

type Asset struct {
	ID, PublicID, StorageKey, Filename, MIMEType, PublicURL string
	Folder, AltText, ProviderVersion                        string
	Tags, Transformations                                   []string
	Bytes                                                   int64
	Width, Height                                           int
	Status                                                  Status
	UploadedBy                                              string
	CreatedAt, UpdatedAt                                    time.Time
}

type UsageReference struct {
	AssetID    string    `bson:"asset_id"`
	EntityType string    `bson:"entity_type"`
	EntityID   string    `bson:"entity_id"`
	Field      string    `bson:"field"`
	CreatedAt  time.Time `bson:"created_at"`
}

type Actor struct {
	ID             string
	CanEditContent bool
}

type AuditEvent struct {
	ActorID, Action, AssetID, Outcome string
	CreatedAt                         time.Time
}

type UploadRequest struct {
	Filename        string   `json:"filename"`
	MIMEType        string   `json:"mime_type"`
	Folder          string   `json:"folder"`
	AltText         string   `json:"alt_text"`
	Tags            []string `json:"tags"`
	Transformations []string `json:"transformations"`
	Bytes           int64    `json:"bytes"`
	Width           int      `json:"width"`
	Height          int      `json:"height"`
}

type SignedUpload struct {
	AssetID   string `json:"asset_id"`
	Provider  string `json:"provider"`
	UploadURL string `json:"upload_url"`
	APIKey    string `json:"api_key"`
	Folder    string `json:"folder"`
	PublicID  string `json:"public_id"`
	Signature string `json:"signature"`
	Timestamp int64  `json:"timestamp"`
}

type Completion struct {
	AssetID, StorageKey, PublicURL, MIMEType, ProviderVersion string
	Bytes                                                     int64
	Width, Height                                             int
}

type Provider interface {
	SignUpload(context.Context, Asset) (SignedUpload, error)
	VerifyCompletion(context.Context, []byte, map[string]string) (Completion, error)
	Delete(context.Context, Asset) error
}

// UploadResponseVerifier is the optional half of Provider for backends that sign
// the reply they hand the browser, letting an upload be completed without
// waiting on an inbound callback. It is kept separate from Provider so a backend
// without signed replies stays a valid Provider — ConfirmUpload reports the
// feature unavailable rather than failing to compile.
type UploadResponseVerifier interface {
	VerifyUploadResponse(context.Context, []byte) (Completion, error)
}

type Repository interface {
	CreateDraftWithAudit(context.Context, Asset, AuditEvent) error
	MarkUploading(context.Context, string, AuditEvent) error
	Complete(context.Context, Completion, string, time.Time, AuditEvent) (Asset, error)
	MarkFailed(context.Context, string, time.Time, AuditEvent) error
	Get(context.Context, string) (Asset, error)
	List(context.Context) ([]Asset, error)
	ListPublicReadyByFolder(context.Context, string, int64) ([]Asset, error)
	UpdateMetadata(context.Context, string, string, []string, []string, time.Time, AuditEvent) (Asset, error)
	References(context.Context, string) ([]UsageReference, error)
	AddReference(context.Context, UsageReference, AuditEvent) error
	RemoveReference(context.Context, UsageReference, AuditEvent) error
	Delete(context.Context, string, time.Time, AuditEvent) error
	PrepareDelete(context.Context, string, time.Time) error
	RestoreDelete(context.Context, string, Status, time.Time, AuditEvent) error
}

var (
	ErrForbidden           = errors.New("media access denied")
	ErrInvalid             = errors.New("invalid media request")
	ErrNotFound            = errors.New("media asset not found")
	ErrConflict            = errors.New("media asset conflict")
	ErrReferenced          = errors.New("media asset is referenced")
	ErrProviderUnavailable = errors.New("media provider unavailable")
	ErrInvalidSignature    = errors.New("invalid provider signature")
	ErrReplay              = errors.New("provider callback replayed")
	ErrAuditUnavailable    = errors.New("media audit unavailable")
)
