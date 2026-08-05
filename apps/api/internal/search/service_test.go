package search

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

type fakeStore struct {
	kinds []Kind
	limit int
	items []Result
	err   error
}

func (store *fakeStore) Search(_ context.Context, _ string, kinds []Kind, limit int) ([]Result, error) {
	store.kinds, store.limit = kinds, limit
	return store.items, store.err
}

func TestRoleScopes(t *testing.T) {
	t.Parallel()
	cases := []struct {
		role     auth.Role
		expected []Kind
	}{
		{auth.RoleAdministrator, []Kind{KindEnquiry, KindContact, KindCampaign, KindBooking, KindContent}},
		{auth.RoleBookingManager, []Kind{KindEnquiry, KindContact, KindCampaign, KindBooking}},
		{auth.RoleContentEditor, []Kind{KindContent}},
		{auth.RoleAnalyst, []Kind{KindCampaign, KindBooking, KindContent}},
	}
	for _, test := range cases {
		store := &fakeStore{}
		_, err := NewService(store).Search(t.Context(), Actor{UserID: "staff", Role: test.role}, Query{Text: "  launch   plan "})
		if err != nil || !reflect.DeepEqual(store.kinds, test.expected) || store.limit != DefaultLimit+1 {
			t.Fatalf("role %s: kinds=%v limit=%d err=%v", test.role, store.kinds, store.limit, err)
		}
	}
}

func TestSearchRejectsUnknownRoleMissingActorAndInvalidBounds(t *testing.T) {
	t.Parallel()
	service := NewService(&fakeStore{})
	for _, test := range []struct {
		actor Actor
		query Query
		want  error
	}{
		{Actor{UserID: "x", Role: "owner"}, Query{Text: "ok"}, ErrForbidden},
		{Actor{Role: auth.RoleAdministrator}, Query{Text: "ok"}, ErrForbidden},
		{Actor{UserID: "x", Role: auth.RoleAdministrator}, Query{Text: "x"}, ErrInvalid},
		{Actor{UserID: "x", Role: auth.RoleAdministrator}, Query{Text: "ok", Limit: MaximumLimit + 1}, ErrInvalid},
		{Actor{UserID: "x", Role: auth.RoleAdministrator}, Query{Text: string([]byte{0xff, 0xfe})}, ErrInvalid},
	} {
		if _, err := service.Search(t.Context(), test.actor, test.query); !errors.Is(err, test.want) {
			t.Fatalf("got %v want %v", err, test.want)
		}
	}
}

func TestSearchRanksCapsAndSignalsLimited(t *testing.T) {
	t.Parallel()
	store := &fakeStore{items: []Result{
		{ID: "10000000-0000-4000-8000-000000000003", Kind: KindContent, Title: "Later", Href: "/admin/content", Score: 1},
		{ID: "10000000-0000-4000-8000-000000000001", Kind: KindBooking, Title: "Best", Href: "/admin/bookings", Score: 9},
		{ID: "10000000-0000-4000-8000-000000000002", Kind: KindCampaign, Title: "Second", Href: "/admin/campaigns", Score: 4},
	}}
	result, err := NewService(store).Search(t.Context(), Actor{UserID: "x", Role: auth.RoleAnalyst}, Query{Text: "launch", Limit: 2})
	if err != nil || !result.Limited || len(result.Items) != 2 || result.Items[0].Title != "Best" || result.Items[1].Title != "Second" || result.Query != "launch" {
		t.Fatalf("unexpected response %#v err=%v", result, err)
	}
}

func TestSearchFailsClosedOnUnsafeStoreProjection(t *testing.T) {
	t.Parallel()
	store := &fakeStore{items: []Result{{ID: "not-an-id", Kind: KindContact, Title: "PII", Href: "https://evil.invalid"}}}
	if _, err := NewService(store).Search(t.Context(), Actor{UserID: "x", Role: auth.RoleAdministrator}, Query{Text: "person"}); err == nil {
		t.Fatal("expected invalid projection to fail closed")
	}
}
