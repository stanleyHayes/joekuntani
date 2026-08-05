package search

import (
	"context"
	"sort"
)

type Store interface {
	Search(context.Context, string, []Kind, int) ([]Result, error)
}

type Service struct{ store Store }

func NewService(store Store) *Service { return &Service{store: store} }

func (service *Service) Search(ctx context.Context, actor Actor, query Query) (Response, error) {
	kinds, ok := allowedKinds(actor.Role)
	if !ok || actor.UserID == "" {
		return Response{}, ErrForbidden
	}
	normalized, err := query.normalized()
	if err != nil {
		return Response{}, err
	}
	items, err := service.store.Search(ctx, normalized.Text, kinds, normalized.Limit+1)
	if err != nil {
		return Response{}, err
	}
	for _, item := range items {
		if !validResult(item) {
			return Response{}, errorsInternal
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Score != items[j].Score {
			return items[i].Score > items[j].Score
		}
		if items[i].Kind != items[j].Kind {
			return items[i].Kind < items[j].Kind
		}
		return items[i].Title < items[j].Title
	})
	limited := len(items) > normalized.Limit
	if limited {
		items = items[:normalized.Limit]
	}
	return Response{Query: normalized.Text, Items: items, Limited: limited}, nil
}

var errorsInternal = &internalError{}

type internalError struct{}

func (*internalError) Error() string { return "invalid search store projection" }
