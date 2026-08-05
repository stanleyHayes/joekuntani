package media

import (
	"context"
	"sort"
	"sync"
	"time"
)

type MemoryRepository struct {
	mu        sync.Mutex
	assets    map[string]Asset
	refs      map[string][]UsageReference
	callbacks map[string]time.Time
	audits    []AuditEvent
	FailAudit bool
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{assets: map[string]Asset{}, refs: map[string][]UsageReference{}, callbacks: map[string]time.Time{}}
}
func (r *MemoryRepository) audit(event AuditEvent) error {
	if r.FailAudit {
		return ErrAuditUnavailable
	}
	r.audits = append(r.audits, event)
	return nil
}
func (r *MemoryRepository) CreateDraftWithAudit(_ context.Context, a Asset, e AuditEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.audit(e); err != nil {
		return err
	}
	if _, ok := r.assets[a.PublicID]; ok {
		return ErrConflict
	}
	r.assets[a.PublicID] = a
	return nil
}
func (r *MemoryRepository) MarkUploading(_ context.Context, id string, e AuditEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	a, ok := r.assets[id]
	if !ok {
		return ErrNotFound
	}
	if a.Status != StatusDraft && a.Status != StatusFailed && a.Status != StatusUploading {
		return ErrConflict
	}
	if err := r.audit(e); err != nil {
		return err
	}
	a.Status = StatusUploading
	r.assets[id] = a
	return nil
}
func (r *MemoryRepository) Complete(_ context.Context, c Completion, eventID string, at time.Time, e AuditEvent) (Asset, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if eventID == "" {
		return Asset{}, ErrInvalidSignature
	}
	if _, exists := r.callbacks[eventID]; exists {
		return Asset{}, ErrReplay
	}
	a, ok := r.assets[c.AssetID]
	if !ok {
		return Asset{}, ErrNotFound
	}
	if a.Status == StatusReady {
		if !completionMatches(a, c) {
			return Asset{}, ErrConflict
		}
		if err := r.audit(e); err != nil {
			return Asset{}, err
		}
		r.callbacks[eventID] = at
		return cloneAsset(a), nil
	}
	if a.Status != StatusUploading {
		return Asset{}, ErrConflict
	}
	if err := r.audit(e); err != nil {
		return Asset{}, err
	}
	r.callbacks[eventID] = at
	a.StorageKey = c.StorageKey
	a.PublicURL = c.PublicURL
	a.MIMEType = c.MIMEType
	a.ProviderVersion = c.ProviderVersion
	a.Bytes = c.Bytes
	a.Width = c.Width
	a.Height = c.Height
	a.Status = StatusReady
	a.UpdatedAt = at
	r.assets[a.PublicID] = a
	return a, nil
}

func completionMatches(asset Asset, completion Completion) bool {
	return asset.StorageKey == completion.StorageKey &&
		asset.PublicURL == completion.PublicURL &&
		asset.MIMEType == completion.MIMEType &&
		asset.ProviderVersion == completion.ProviderVersion &&
		asset.Bytes == completion.Bytes &&
		asset.Width == completion.Width &&
		asset.Height == completion.Height
}
func (r *MemoryRepository) MarkFailed(_ context.Context, id string, at time.Time, e AuditEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	a, ok := r.assets[id]
	if !ok {
		return ErrNotFound
	}
	if a.Status != StatusUploading {
		return ErrConflict
	}
	if err := r.audit(e); err != nil {
		return err
	}
	a.Status = StatusFailed
	a.UpdatedAt = at
	r.assets[id] = a
	return nil
}
func (r *MemoryRepository) Get(_ context.Context, id string) (Asset, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	a, ok := r.assets[id]
	if !ok || a.Status == StatusDeleted {
		return Asset{}, ErrNotFound
	}
	return cloneAsset(a), nil
}
func (r *MemoryRepository) List(_ context.Context) ([]Asset, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []Asset{}
	for _, a := range r.assets {
		if a.Status != StatusDeleted {
			out = append(out, cloneAsset(a))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}
func (r *MemoryRepository) UpdateMetadata(_ context.Context, id, alt string, tags, transforms []string, at time.Time, e AuditEvent) (Asset, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	a, ok := r.assets[id]
	if !ok {
		return Asset{}, ErrNotFound
	}
	if err := r.audit(e); err != nil {
		return Asset{}, err
	}
	a.AltText = alt
	a.Tags = append([]string(nil), tags...)
	a.Transformations = append([]string(nil), transforms...)
	a.UpdatedAt = at
	r.assets[id] = a
	return cloneAsset(a), nil
}
func (r *MemoryRepository) References(_ context.Context, id string) ([]UsageReference, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]UsageReference(nil), r.refs[id]...), nil
}
func (r *MemoryRepository) AddReference(_ context.Context, ref UsageReference, e AuditEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	asset, ok := r.assets[ref.AssetID]
	if !ok {
		return ErrNotFound
	}
	if asset.Status == StatusDeleting || asset.Status == StatusDeleted {
		return ErrConflict
	}
	for _, x := range r.refs[ref.AssetID] {
		if x.EntityType == ref.EntityType && x.EntityID == ref.EntityID && x.Field == ref.Field {
			return nil
		}
	}
	if err := r.audit(e); err != nil {
		return err
	}
	r.refs[ref.AssetID] = append(r.refs[ref.AssetID], ref)
	return nil
}
func (r *MemoryRepository) RemoveReference(_ context.Context, ref UsageReference, e AuditEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := r.audit(e); err != nil {
		return err
	}
	items := r.refs[ref.AssetID]
	out := items[:0]
	for _, x := range items {
		if x.EntityType != ref.EntityType || x.EntityID != ref.EntityID || x.Field != ref.Field {
			out = append(out, x)
		}
	}
	r.refs[ref.AssetID] = out
	return nil
}
func (r *MemoryRepository) Delete(_ context.Context, id string, at time.Time, e AuditEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	a, ok := r.assets[id]
	if !ok {
		return ErrNotFound
	}
	if len(r.refs[id]) > 0 {
		return ErrReferenced
	}
	if err := r.audit(e); err != nil {
		return err
	}
	a.Status = StatusDeleted
	a.UpdatedAt = at
	r.assets[id] = a
	return nil
}
func (r *MemoryRepository) PrepareDelete(_ context.Context, id string, at time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	a, ok := r.assets[id]
	if !ok {
		return ErrNotFound
	}
	if len(r.refs[id]) > 0 {
		return ErrReferenced
	}
	if a.Status == StatusDeleted || a.Status == StatusDeleting {
		return ErrConflict
	}
	a.Status = StatusDeleting
	a.UpdatedAt = at
	r.assets[id] = a
	return nil
}
func (r *MemoryRepository) RestoreDelete(_ context.Context, id string, status Status, at time.Time, event AuditEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	a, ok := r.assets[id]
	if !ok {
		return ErrNotFound
	}
	if a.Status != StatusDeleting {
		return ErrConflict
	}
	if err := r.audit(event); err != nil {
		return err
	}
	a.Status = status
	a.UpdatedAt = at
	r.assets[id] = a
	return nil
}
func (r *MemoryRepository) Audits() []AuditEvent {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]AuditEvent(nil), r.audits...)
}
func cloneAsset(a Asset) Asset {
	a.Tags = append([]string(nil), a.Tags...)
	a.Transformations = append([]string(nil), a.Transformations...)
	return a
}
