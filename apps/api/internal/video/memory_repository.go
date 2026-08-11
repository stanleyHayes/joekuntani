package video

import (
	"context"
	"sync"
)

type MemoryRepository struct {
	mu         sync.Mutex
	items      map[string]Item
	webhooks   map[string]bool
	categories map[string]Category
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{items: map[string]Item{}, webhooks: map[string]bool{}, categories: map[string]Category{}}
}

func (repository *MemoryRepository) Create(_ context.Context, item Item) error {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	for _, current := range repository.items {
		if current.Slug == item.Slug || (current.Provider == item.Provider && current.ProviderVideoID == item.ProviderVideoID) {
			return ErrConflict
		}
	}
	repository.items[item.PublicID] = cloneItem(item)
	return nil
}
func (repository *MemoryRepository) Get(_ context.Context, publicID string) (Item, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	item, ok := repository.items[publicID]
	if !ok {
		return Item{}, ErrNotFound
	}
	return cloneItem(item), nil
}
func (repository *MemoryRepository) GetByProviderID(_ context.Context, provider, providerID string) (Item, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	for _, item := range repository.items {
		if item.Provider == provider && item.ProviderVideoID == providerID {
			return cloneItem(item), nil
		}
	}
	return Item{}, ErrNotFound
}
func (repository *MemoryRepository) List(_ context.Context, publicOnly bool) ([]Item, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	items := []Item{}
	for _, item := range repository.items {
		if item.Status != StatusDeleted && (!publicOnly || item.Published) {
			items = append(items, cloneItem(item))
		}
	}
	return items, nil
}
func (repository *MemoryRepository) Update(_ context.Context, item Item, revision int64) (Item, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	current, ok := repository.items[item.PublicID]
	if !ok {
		return Item{}, ErrNotFound
	}
	if revision != current.Revision {
		return Item{}, ErrConflict
	}
	item.Revision = revision + 1
	repository.items[item.PublicID] = cloneItem(item)
	return cloneItem(item), nil
}
func (repository *MemoryRepository) RecordWebhook(_ context.Context, key, _ string, _ []byte) (bool, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	if repository.webhooks[key] {
		return false, nil
	}
	repository.webhooks[key] = true
	return true, nil
}
func cloneItem(item Item) Item { item.Tags = append([]string{}, item.Tags...); return item }

func (repository *MemoryRepository) CreateCategory(_ context.Context, category Category) error {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	for _, current := range repository.categories {
		if current.Slug == category.Slug {
			return ErrConflict
		}
	}
	repository.categories[category.PublicID] = category
	return nil
}
func (repository *MemoryRepository) ListCategories(_ context.Context) ([]Category, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	result := make([]Category, 0, len(repository.categories))
	for _, category := range repository.categories {
		result = append(result, category)
	}
	return result, nil
}
func (repository *MemoryRepository) GetCategory(_ context.Context, publicID string) (Category, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	category, ok := repository.categories[publicID]
	if !ok {
		return Category{}, ErrNotFound
	}
	return category, nil
}
func (repository *MemoryRepository) UpdateCategory(_ context.Context, category Category, revision int64) (Category, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	current, ok := repository.categories[category.PublicID]
	if !ok {
		return Category{}, ErrNotFound
	}
	if current.Revision != revision {
		return Category{}, ErrConflict
	}
	category.Revision = revision + 1
	repository.categories[category.PublicID] = category
	return category, nil
}
