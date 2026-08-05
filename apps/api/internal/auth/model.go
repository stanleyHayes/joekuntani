package auth

import (
	"context"
	"errors"
	"time"
)

type Role string

const (
	RoleAdministrator  Role = "administrator"
	RoleBookingManager Role = "booking_manager"
	RoleContentEditor  Role = "content_editor"
	RoleAnalyst        Role = "analyst"
)

type Permission string

const (
	PermissionAdminAccess      Permission = "admin:access"
	PermissionUsersManage      Permission = "users:manage"
	PermissionContentEdit      Permission = "content:edit"
	PermissionEnquiriesManage  Permission = "enquiries:manage"
	PermissionProposalsManage  Permission = "proposals:manage"
	PermissionBookingsManage   Permission = "bookings:manage"
	PermissionContactsManage   Permission = "contacts:manage"
	PermissionNotesManage      Permission = "notes:manage"
	PermissionTasksManage      Permission = "tasks:manage"
	PermissionStatusManage     Permission = "status:manage"
	PermissionDashboardsRead   Permission = "dashboards:read"
	PermissionReportsExport    Permission = "reports:export"
	PermissionFinancialRecords Permission = "financial_records:manage"
	PermissionSettingsEdit     Permission = "settings:edit"
	PermissionSettingsManage   Permission = "settings:manage"
)

var rolePermissions = map[Role]map[Permission]bool{
	RoleAdministrator:  {PermissionAdminAccess: true, PermissionUsersManage: true, PermissionContentEdit: true, PermissionEnquiriesManage: true, PermissionProposalsManage: true, PermissionBookingsManage: true, PermissionContactsManage: true, PermissionNotesManage: true, PermissionTasksManage: true, PermissionStatusManage: true, PermissionDashboardsRead: true, PermissionReportsExport: true, PermissionFinancialRecords: true, PermissionSettingsEdit: true, PermissionSettingsManage: true},
	RoleBookingManager: {PermissionAdminAccess: true, PermissionEnquiriesManage: true, PermissionProposalsManage: true, PermissionBookingsManage: true, PermissionContactsManage: true, PermissionNotesManage: true, PermissionTasksManage: true, PermissionStatusManage: true},
	RoleContentEditor:  {PermissionAdminAccess: true, PermissionContentEdit: true, PermissionSettingsEdit: true},
	RoleAnalyst:        {PermissionAdminAccess: true, PermissionDashboardsRead: true, PermissionReportsExport: true},
}

func (role Role) Allows(permission Permission) bool { return rolePermissions[role][permission] }

type User struct {
	ID             string
	PublicID       string
	Name           string
	Email          string
	PasswordHash   string
	Role           Role
	MFAEnabled     bool
	MFASecret      string
	Status         string
	UpdatedAt      time.Time
	LastMFACounter int64
}

func (user User) Active() bool { return user.Status == "active" }

type Session struct {
	ID            string
	UserID        string
	TokenHash     string
	CSRFHash      string
	MFAVerified   bool
	UserVersion   time.Time
	ExpiresAt     time.Time
	LastRotatedAt time.Time
	RevokedAt     *time.Time
}

type AuditEvent struct {
	ActorID   string
	Action    string
	EntityID  string
	Outcome   string
	CreatedAt time.Time
}

var (
	ErrInvalidCredentials  = errors.New("invalid credentials")
	ErrMFARequired         = errors.New("mfa required")
	ErrInvalidMFA          = errors.New("invalid mfa code")
	ErrUnauthorized        = errors.New("unauthorized")
	ErrForbidden           = errors.New("forbidden")
	ErrInvalidCSRF         = errors.New("invalid csrf token")
	ErrUserNotFound        = errors.New("user not found")
	ErrSecurityUnavailable = errors.New("security event persistence unavailable")
	ErrConflict            = errors.New("authentication state conflict")
)

type Store interface {
	FindUserByEmail(context.Context, string) (User, error)
	FindUserByID(context.Context, string) (User, error)
	SaveSessionWithAudit(context.Context, Session, AuditEvent) error
	FindSessionByTokenHash(context.Context, string) (Session, error)
	CompleteMFA(context.Context, string, string, int64, string, string, time.Time, AuditEvent) error
	RevokeSessionWithAudit(context.Context, string, time.Time, AuditEvent) error
	DisableUserAndRevokeSessions(context.Context, string, time.Time, AuditEvent) error
	AppendAudit(context.Context, AuditEvent) error
}
