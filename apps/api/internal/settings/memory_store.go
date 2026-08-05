package settings

import (
	"context"
	"sync"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

type MemoryStore struct {
	mu       sync.Mutex
	document *Document
}

func NewMemoryStore(document *Document) *MemoryStore { return &MemoryStore{document: document} }
func (store *MemoryStore) Get(context.Context) (Document, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.document == nil {
		return Document{}, ErrNotFound
	}
	return clone(*store.document), nil
}
func (store *MemoryStore) Update(_ context.Context, expected int64, values Values, complete bool, actor auth.Principal, now time.Time) (Document, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.document == nil {
		if expected != 0 {
			return Document{}, ErrConflict
		}
		store.document = &Document{Key: GlobalKey}
	}
	if store.document.Version != expected {
		return Document{}, ErrConflict
	}
	store.document.Version++
	store.document.Draft = values
	store.document.ContentComplete = complete
	store.document.UpdatedBy = actor.UserID
	store.document.UpdatedAt = now
	return clone(*store.document), nil
}
func (store *MemoryStore) Publish(_ context.Context, expected int64, actor auth.Principal, now time.Time) (Document, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.document == nil {
		return Document{}, ErrNotFound
	}
	if store.document.Version != expected {
		return Document{}, ErrConflict
	}
	value := store.document.Draft
	store.document.Published = &value
	store.document.Version++
	store.document.UpdatedBy = actor.UserID
	store.document.UpdatedAt = now
	store.document.PublishedAt = &now
	return clone(*store.document), nil
}
func clone(document Document) Document {
	result := document
	result.Draft.Navigation = append([]Link(nil), document.Draft.Navigation...)
	if document.Published != nil {
		value := *document.Published
		result.Published = &value
	}
	return result
}
