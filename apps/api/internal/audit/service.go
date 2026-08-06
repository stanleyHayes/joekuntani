package audit

import "context"

type Store interface {
	Search(context.Context, Query) ([]Entry, error)
}

type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store: store} }

func (service *Service) Search(ctx context.Context, actor Actor, query Query) (Response, error) {
	if actor.UserID == "" || !canRead(actor.Role) {
		return Response{}, ErrForbidden
	}
	normalized, err := query.normalized()
	if err != nil {
		return Response{}, err
	}
	items, err := service.store.Search(ctx, Query{
		Text:       normalized.Text,
		Action:     normalized.Action,
		EntityType: normalized.EntityType,
		From:       normalized.From,
		To:         normalized.To,
		Limit:      normalized.Limit + 1,
	})
	if err != nil {
		return Response{}, ErrUnavailable
	}
	for _, item := range items {
		if !validEntry(item) {
			return Response{}, ErrUnavailable
		}
	}
	limited := len(items) > normalized.Limit
	if limited {
		items = items[:normalized.Limit]
	}
	return Response{Query: normalized.Text, Items: items, Limited: limited}, nil
}

func validEntry(entry Entry) bool {
	return entry.ID != "" && entry.Action != "" && entry.EntityType != "" && !entry.CreatedAt.IsZero()
}
