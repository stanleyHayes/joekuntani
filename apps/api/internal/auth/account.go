package auth

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"
)

// StaffRecord is the safe staff projection for directory UIs.
type StaffRecord struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Email      string    `json:"email"`
	Role       Role      `json:"role"`
	Status     string    `json:"status"`
	MFAEnabled bool      `json:"mfa_enabled"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Preferences struct {
	EmailProductUpdates bool   `json:"email_product_updates"`
	EmailSecurityAlerts bool   `json:"email_security_alerts"`
	DenseUI             bool   `json:"dense_ui"`
	Timezone            string `json:"timezone"`
}

func DefaultPreferences() Preferences {
	return Preferences{
		EmailProductUpdates: false,
		EmailSecurityAlerts: true,
		DenseUI:             false,
		Timezone:            "Africa/Accra",
	}
}

type ProvisionInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     Role   `json:"role"`
}

func RoleCatalog() []map[string]any {
	order := []Role{RoleAdministrator, RoleBookingManager, RoleContentEditor, RoleAnalyst}
	labels := map[Role]string{
		RoleAdministrator:  "Administrator",
		RoleBookingManager: "Booking manager",
		RoleContentEditor:  "Content editor",
		RoleAnalyst:        "Analyst",
	}
	out := make([]map[string]any, 0, len(order))
	for _, role := range order {
		perms := make([]string, 0, len(rolePermissions[role]))
		for permission := range rolePermissions[role] {
			perms = append(perms, string(permission))
		}
		sort.Strings(perms)
		out = append(out, map[string]any{
			"role":        role,
			"label":       labels[role],
			"permissions": perms,
		})
	}
	return out
}

func PermissionCatalog() []string {
	all := []Permission{
		PermissionAdminAccess, PermissionUsersManage, PermissionContentEdit, PermissionEnquiriesManage,
		PermissionProposalsManage, PermissionBookingsManage, PermissionContactsManage, PermissionNotesManage,
		PermissionTasksManage, PermissionStatusManage, PermissionDashboardsRead, PermissionReportsExport,
		PermissionFinancialRecords, PermissionSettingsEdit, PermissionSettingsManage,
	}
	out := make([]string, 0, len(all))
	for _, permission := range all {
		out = append(out, string(permission))
	}
	return out
}

func (service *Service) CurrentPrincipal(ctx context.Context, principal Principal) (map[string]any, error) {
	user, err := service.store.FindUserByID(ctx, principal.InternalUserID)
	if err != nil {
		return nil, err
	}
	prefs, err := service.store.GetPreferences(ctx, user.PublicID)
	if err != nil {
		prefs = DefaultPreferences()
	}
	permissions := make([]string, 0)
	for permission := range rolePermissions[user.Role] {
		permissions = append(permissions, string(permission))
	}
	sort.Strings(permissions)
	return map[string]any{
		"id":           user.PublicID,
		"name":         user.Name,
		"email":        user.Email,
		"role":         user.Role,
		"mfa_verified": principal.MFAVerified,
		"mfa_enabled":  user.MFAEnabled,
		"permissions":  permissions,
		"preferences":  prefs,
	}, nil
}

func (service *Service) ListStaff(ctx context.Context, actor Principal) ([]StaffRecord, error) {
	if err := service.Authorize(actor, PermissionUsersManage); err != nil {
		return nil, err
	}
	return service.store.ListUsers(ctx)
}

func (service *Service) ProvisionStaff(ctx context.Context, actor Principal, input ProvisionInput) (string, error) {
	if err := service.Authorize(actor, PermissionUsersManage); err != nil {
		return "", err
	}
	name := strings.TrimSpace(input.Name)
	email := strings.ToLower(strings.TrimSpace(input.Email))
	password := strings.TrimSpace(input.Password)
	if name == "" || email == "" || !strings.Contains(email, "@") || len(password) < 12 {
		return "", ErrInvalidCredentials
	}
	if input.Role != RoleAdministrator && input.Role != RoleBookingManager && input.Role != RoleContentEditor && input.Role != RoleAnalyst {
		return "", ErrInvalidCredentials
	}
	mfaSecret := ""
	if input.Role == RoleAdministrator {
		secret, err := GenerateMFASecret()
		if err != nil {
			return "", err
		}
		mfaSecret = secret
	}
	id, err := service.store.ProvisionStaff(ctx, name, email, password, input.Role, mfaSecret)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "E11000") {
			return "", ErrConflict
		}
		return "", err
	}
	_ = service.audit(ctx, actor.InternalUserID, "user.provision", id, "accepted")
	return id, nil
}

func (service *Service) UpdateOwnProfile(ctx context.Context, actor Principal, name string) error {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 120 {
		return ErrInvalidCredentials
	}
	now := service.now().UTC()
	return service.store.UpdateProfile(ctx, actor.InternalUserID, name, now, service.event(actor.InternalUserID, "user.profile_update", actor.UserID, "accepted"))
}

func (service *Service) ChangeOwnPassword(ctx context.Context, actor Principal, session Session, currentPassword, newPassword string) error {
	if len(strings.TrimSpace(newPassword)) < 12 {
		return ErrInvalidCredentials
	}
	user, err := service.store.FindUserByID(ctx, actor.InternalUserID)
	if err != nil {
		return err
	}
	if !VerifyPassword(user.PasswordHash, currentPassword) {
		_ = service.audit(ctx, actor.InternalUserID, "user.password_change", actor.UserID, "denied")
		return ErrInvalidCredentials
	}
	hash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	now := service.now().UTC()
	return service.store.ChangePassword(ctx, actor.InternalUserID, session.ID, hash, now, service.event(actor.InternalUserID, "user.password_change", actor.UserID, "accepted"))
}

func (service *Service) UpdateStaffRole(ctx context.Context, actor Principal, userID string, role Role) error {
	if err := service.Authorize(actor, PermissionUsersManage); err != nil {
		return err
	}
	if role != RoleAdministrator && role != RoleBookingManager && role != RoleContentEditor && role != RoleAnalyst {
		return ErrInvalidCredentials
	}
	if userID == actor.UserID {
		return ErrForbidden
	}
	now := service.now().UTC()
	return service.store.UpdateRole(ctx, userID, role, now, service.event(actor.InternalUserID, "user.role_update", userID, "accepted"))
}

func (service *Service) SaveOwnPreferences(ctx context.Context, actor Principal, prefs Preferences) error {
	prefs.Timezone = strings.TrimSpace(prefs.Timezone)
	if prefs.Timezone == "" {
		prefs.Timezone = "Africa/Accra"
	}
	if len(prefs.Timezone) > 64 {
		return ErrInvalidCredentials
	}
	return service.store.SavePreferences(ctx, actor.UserID, prefs, service.event(actor.InternalUserID, "user.preferences_update", actor.UserID, "accepted"))
}

func (service *Service) GetOwnPreferences(ctx context.Context, actor Principal) (Preferences, error) {
	prefs, err := service.store.GetPreferences(ctx, actor.UserID)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return DefaultPreferences(), nil
		}
		return Preferences{}, err
	}
	return prefs, nil
}
