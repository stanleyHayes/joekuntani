package settings

import (
	"context"
	"errors"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

type Store interface {
	Get(context.Context) (Document, error)
	Update(context.Context, int64, Values, bool, auth.Principal, time.Time) (Document, error)
	Publish(context.Context, int64, auth.Principal, time.Time) (Document, error)
}

type Service struct {
	store Store
	now   func() time.Time
}

func NewService(store Store, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{store: store, now: now}
}
func (service *Service) GetAdmin(ctx context.Context, actor auth.Principal) (Document, error) {
	if !actor.Role.Allows(auth.PermissionSettingsEdit) {
		return Document{}, ErrForbidden
	}
	document, err := service.store.Get(ctx)
	if errors.Is(err, ErrNotFound) && actor.Role == auth.RoleAdministrator {
		return Document{Key: GlobalKey, Draft: EmptyValues()}, nil
	}
	return roleView(document, actor.Role), err
}
func (service *Service) GetPublic(ctx context.Context) (PublicValues, error) {
	document, err := service.store.Get(ctx)
	if err != nil {
		return PublicValues{}, err
	}
	if document.Published == nil {
		return PublicValues{}, ErrNotFound
	}
	if err := Validate(*document.Published); err != nil {
		return PublicValues{}, err
	}
	return document.Published.Public(), nil
}
func (service *Service) Update(ctx context.Context, actor auth.Principal, version int64, values Values, complete bool) (Document, error) {
	if !actor.Role.Allows(auth.PermissionSettingsEdit) {
		return Document{}, ErrForbidden
	}
	if version < 0 {
		return Document{}, ErrConflict
	}
	current, err := service.store.Get(ctx)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return Document{}, err
	}
	if errors.Is(err, ErrNotFound) && actor.Role != auth.RoleAdministrator {
		return Document{}, ErrForbidden
	}
	if err == nil && actor.Role != auth.RoleAdministrator {
		values.Integrations = current.Draft.Integrations
		values.Team = current.Draft.Team
	}
	if err := Validate(values); err != nil {
		return Document{}, err
	}
	if actor.Role != auth.RoleAdministrator && complete != current.ContentComplete {
		return Document{}, ErrForbidden
	}
	updated, err := service.store.Update(ctx, version, values, complete, actor, service.now().UTC())
	return roleView(updated, actor.Role), err
}
func (service *Service) Publish(ctx context.Context, actor auth.Principal, version int64) (Document, error) {
	if !actor.Role.Allows(auth.PermissionSettingsManage) {
		return Document{}, ErrForbidden
	}
	current, err := service.store.Get(ctx)
	if err != nil {
		return Document{}, err
	}
	if !current.ContentComplete {
		return Document{}, errors.New("content is incomplete")
	}
	if err := Validate(current.Draft); err != nil {
		return Document{}, err
	}
	published, err := service.store.Publish(ctx, version, actor, service.now().UTC())
	return roleView(published, actor.Role), err
}

func roleView(document Document, role auth.Role) Document {
	if role == auth.RoleAdministrator {
		return document
	}
	document.Draft.Integrations = Integration{}
	document.Draft.Team = Team{NotificationRecipients: []string{}}
	if document.Published != nil {
		document.Published.Integrations = Integration{}
		document.Published.Team = Team{NotificationRecipients: []string{}}
	}
	return document
}
