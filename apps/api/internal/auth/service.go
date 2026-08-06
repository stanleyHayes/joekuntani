package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

type Clock func() time.Time

type Service struct {
	store Store
	now   Clock
	ttl   time.Duration
}

type Credentials struct{ Email, Password string }
type Tokens struct {
	Session, CSRF string
	MFARequired   bool
}
type Principal struct {
	UserID, InternalUserID, Name string
	Role                         Role
	MFAVerified                  bool
}

var dummyPasswordHash = func() string {
	hash, err := HashPassword("not-a-real-password-value")
	if err != nil {
		panic(err)
	}
	return hash
}()

func NewService(store Store, now Clock, ttl time.Duration) *Service {
	if now == nil {
		now = time.Now
	}
	if ttl <= 0 {
		ttl = 12 * time.Hour
	}
	return &Service{store: store, now: now, ttl: ttl}
}

func (service *Service) Login(ctx context.Context, credentials Credentials) (Tokens, error) {
	email := strings.ToLower(strings.TrimSpace(credentials.Email))
	user, err := service.store.FindUserByEmail(ctx, email)
	passwordHash := dummyPasswordHash
	if err == nil {
		passwordHash = user.PasswordHash
	}
	passwordValid := VerifyPassword(passwordHash, credentials.Password)
	if err != nil || !user.Active() || !passwordValid {
		if auditErr := service.audit(ctx, "", "auth.login", "", "denied"); auditErr != nil {
			return Tokens{}, ErrSecurityUnavailable
		}
		return Tokens{}, ErrInvalidCredentials
	}
	if user.Role == RoleAdministrator && (!user.MFAEnabled || user.MFASecret == "") {
		if auditErr := service.audit(ctx, user.ID, "auth.login", user.PublicID, "mfa_not_configured"); auditErr != nil {
			return Tokens{}, ErrSecurityUnavailable
		}
		return Tokens{}, ErrMFARequired
	}
	sessionToken, csrfToken, err := newToken(), newToken(), error(nil)
	if sessionToken == "" || csrfToken == "" {
		err = errorsRandom
	}
	if err != nil {
		return Tokens{}, err
	}
	now := service.now().UTC()
	verified := !user.MFAEnabled
	session := Session{ID: newToken(), UserID: user.ID, TokenHash: digest(sessionToken), CSRFHash: digest(csrfToken), MFAVerified: verified, UserVersion: user.UpdatedAt, ExpiresAt: now.Add(service.ttl), LastRotatedAt: now}
	if session.ID == "" {
		return Tokens{}, errorsRandom
	}
	audit := service.event(user.ID, "auth.login", user.PublicID, "accepted")
	if err := service.store.SaveSessionWithAudit(ctx, session, audit); err != nil {
		return Tokens{}, ErrSecurityUnavailable
	}
	return Tokens{Session: sessionToken, CSRF: csrfToken, MFARequired: !verified}, nil
}

var errorsRandom = fmt.Errorf("secure random source unavailable")

func newToken() string {
	data := make([]byte, 32)
	if _, err := rand.Read(data); err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(data)
}
func digest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (service *Service) Authenticate(ctx context.Context, token string) (Principal, Session, error) {
	if token == "" {
		return Principal{}, Session{}, ErrUnauthorized
	}
	session, err := service.store.FindSessionByTokenHash(ctx, digest(token))
	if err != nil || session.RevokedAt != nil || !service.now().Before(session.ExpiresAt) {
		return Principal{}, Session{}, ErrUnauthorized
	}
	user, err := service.store.FindUserByID(ctx, session.UserID)
	if err != nil || !user.Active() || !user.UpdatedAt.Equal(session.UserVersion) {
		return Principal{}, Session{}, ErrUnauthorized
	}
	if user.MFAEnabled && !session.MFAVerified {
		return Principal{}, session, ErrMFARequired
	}
	return Principal{UserID: user.PublicID, InternalUserID: user.ID, Name: user.Name, Role: user.Role, MFAVerified: session.MFAVerified}, session, nil
}

type MFASetup struct {
	Email      string
	Secret     string
	OTPAuthURI string
}

// PendingMFASetup returns authenticator enrollment material for a session that
// has passed password login but has not completed MFA yet.
func (service *Service) PendingMFASetup(ctx context.Context, token string) (MFASetup, error) {
	session, err := service.store.FindSessionByTokenHash(ctx, digest(token))
	if err != nil || session.RevokedAt != nil || !service.now().Before(session.ExpiresAt) {
		return MFASetup{}, ErrUnauthorized
	}
	if session.MFAVerified {
		return MFASetup{}, ErrConflict
	}
	user, err := service.store.FindUserByID(ctx, session.UserID)
	if err != nil || !user.Active() || !user.MFAEnabled || user.MFASecret == "" {
		return MFASetup{}, ErrUnauthorized
	}
	label := url.PathEscape("Joe Kuntani:" + user.Email)
	issuer := url.QueryEscape("Joe Kuntani")
	uri := fmt.Sprintf(
		"otpauth://totp/%s?secret=%s&issuer=%s&algorithm=SHA1&digits=6&period=30",
		label,
		strings.ToUpper(strings.ReplaceAll(user.MFASecret, " ", "")),
		issuer,
	)
	return MFASetup{Email: user.Email, Secret: user.MFASecret, OTPAuthURI: uri}, nil
}

func (service *Service) CompleteMFA(ctx context.Context, token, code string) (Tokens, error) {
	session, err := service.store.FindSessionByTokenHash(ctx, digest(token))
	if err != nil || session.RevokedAt != nil || !service.now().Before(session.ExpiresAt) {
		return Tokens{}, ErrUnauthorized
	}
	user, err := service.store.FindUserByID(ctx, session.UserID)
	if err != nil || !user.Active() || !user.MFAEnabled || user.MFASecret == "" {
		return Tokens{}, ErrUnauthorized
	}
	counter, valid := VerifyTOTP(user.MFASecret, code, service.now())
	if !valid {
		if auditErr := service.audit(ctx, user.ID, "auth.mfa", user.PublicID, "denied"); auditErr != nil {
			return Tokens{}, ErrSecurityUnavailable
		}
		return Tokens{}, ErrInvalidMFA
	}
	newSession, csrf := newToken(), newToken()
	if newSession == "" || csrf == "" {
		return Tokens{}, errorsRandom
	}
	audit := service.event(user.ID, "auth.mfa", user.PublicID, "accepted")
	if err := service.store.CompleteMFA(ctx, session.ID, session.TokenHash, counter, digest(newSession), digest(csrf), service.now().UTC(), audit); err != nil {
		if errors.Is(err, ErrConflict) {
			return Tokens{}, ErrInvalidMFA
		}
		return Tokens{}, ErrSecurityUnavailable
	}
	return Tokens{Session: newSession, CSRF: csrf}, nil
}

func (service *Service) Authorize(principal Principal, permission Permission) error {
	if !principal.Role.Allows(permission) {
		return ErrForbidden
	}
	return nil
}
func (service *Service) ValidateCSRF(session Session, token string) error {
	if token == "" || digest(token) != session.CSRFHash {
		return ErrInvalidCSRF
	}
	return nil
}
func (service *Service) Logout(ctx context.Context, session Session) error {
	now := service.now().UTC()
	return service.store.RevokeSessionWithAudit(ctx, session.ID, now, service.event(session.UserID, "auth.logout", session.UserID, "accepted"))
}
func (service *Service) DisableUser(ctx context.Context, actor Principal, userID string) error {
	if err := service.Authorize(actor, PermissionUsersManage); err != nil {
		return err
	}
	now := service.now().UTC()
	if err := service.store.DisableUserAndRevokeSessions(ctx, userID, now, service.event(actor.InternalUserID, "user.disable", userID, "accepted")); err != nil {
		return err
	}
	return nil
}
func (service *Service) event(actor, action, entity, outcome string) AuditEvent {
	return AuditEvent{ActorID: actor, Action: action, EntityID: entity, Outcome: outcome, CreatedAt: service.now().UTC()}
}
func (service *Service) audit(ctx context.Context, actor, action, entity, outcome string) error {
	if err := service.store.AppendAudit(ctx, service.event(actor, action, entity, outcome)); err != nil {
		return ErrSecurityUnavailable
	}
	return nil
}
