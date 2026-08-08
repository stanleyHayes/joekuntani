package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// InvitationLifetime bounds how long an unaccepted invitation stays usable. It
// is deliberately short: the link is a single-use credential until it is spent,
// and an inbox is not a vault. Fifteen minutes is enough to open a mail client
// and choose a password, and short enough that a forwarded or archived message
// is worthless by the time anyone else reads it. An expired invitation is
// reissued from the console, so the cost of the tight window is one click.
const InvitationLifetime = 15 * time.Minute

// Invitation is the safe projection of a pending staff invitation. It carries
// no token — only what the acceptance screen needs to greet the invitee.
type Invitation struct {
	UserID    string    `json:"-"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      Role      `json:"role"`
	ExpiresAt time.Time `json:"expires_at"`
}

// InvitationMailer delivers the acceptance link. It is optional: when no mail
// provider is configured the invitation is still created and its link returned
// to the administrator, so staff onboarding is never blocked on email delivery.
type InvitationMailer interface {
	SendStaffInvitation(ctx context.Context, email, name, acceptURL string) error
}

// NewInvitationToken mints the raw token handed to the invitee alongside the
// hash that is all the database ever sees. A leaked database backup therefore
// yields no usable invitations.
func NewInvitationToken() (token, hash string, err error) {
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", "", fmt.Errorf("generate invitation token: %w", err)
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	return token, HashInvitationToken(token), nil
}

// HashInvitationToken is a plain SHA-256: the token is 256 bits of entropy from
// a CSPRNG, so it is not guessable and needs no password-style stretching.
func HashInvitationToken(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(sum[:])
}

// InviteStaff creates the staff record in an `invited` state and issues its
// acceptance token. No password is chosen here — not by the administrator and
// not by the server — so no credential for the new account exists until the
// invitee sets one.
func (service *Service) InviteStaff(ctx context.Context, actor Principal, input ProvisionInput) (Invitation, string, error) {
	if err := service.Authorize(actor, PermissionUsersManage); err != nil {
		return Invitation{}, "", err
	}
	name := strings.TrimSpace(input.Name)
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if len(name) > 120 || email == "" || !strings.Contains(email, "@") {
		return Invitation{}, "", ErrInvalidCredentials
	}
	// An administrator supplies an address and a role, nothing else. Guessing
	// someone's name on their behalf is how directories fill with misspellings,
	// so the placeholder is plainly derived from the address and the invitee
	// corrects it from their own profile once they are in.
	if name == "" {
		name = nameFromEmail(email)
	}
	if !input.Role.provisionable() {
		return Invitation{}, "", ErrInvalidCredentials
	}
	mfaSecret := ""
	if input.Role == RoleAdministrator {
		secret, err := GenerateMFASecret()
		if err != nil {
			return Invitation{}, "", err
		}
		mfaSecret = secret
	}
	token, hash, err := NewInvitationToken()
	if err != nil {
		return Invitation{}, "", err
	}
	now := service.now().UTC()
	expiresAt := now.Add(InvitationLifetime)
	userID, err := service.store.ProvisionInvitedStaff(ctx, name, email, input.Role, mfaSecret, hash, expiresAt,
		service.event(actor.InternalUserID, "user.invite", email, "accepted"))
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "E11000") {
			return Invitation{}, "", ErrConflict
		}
		return Invitation{}, "", err
	}
	return Invitation{UserID: userID, Name: name, Email: email, Role: input.Role, ExpiresAt: expiresAt}, token, nil
}

// Invitation resolves a raw token for the acceptance screen. Expiry is checked
// here as well as in the store so a clock skew between them cannot widen the
// window.
func (service *Service) Invitation(ctx context.Context, token string) (Invitation, error) {
	if strings.TrimSpace(token) == "" {
		return Invitation{}, ErrInvitationInvalid
	}
	invitation, err := service.store.FindInvitation(ctx, HashInvitationToken(token))
	if err != nil {
		return Invitation{}, ErrInvitationInvalid
	}
	if !service.now().UTC().Before(invitation.ExpiresAt) {
		return Invitation{}, ErrInvitationInvalid
	}
	return invitation, nil
}

// AcceptInvitation sets the invitee's own password and activates the account.
// The store spends the invitation in the same transaction, so a replayed link
// cannot reset a password that has already been chosen.
func (service *Service) AcceptInvitation(ctx context.Context, token, password string) error {
	invitation, err := service.Invitation(ctx, token)
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(password)) < 12 {
		return ErrInvalidCredentials
	}
	hash, err := HashPassword(password)
	if err != nil {
		return ErrInvalidCredentials
	}
	now := service.now().UTC()
	return service.store.AcceptInvitation(ctx, HashInvitationToken(token), hash, now,
		AuditEvent{ActorID: invitation.UserID, Action: "user.invite_accepted", EntityID: invitation.UserID, Outcome: "accepted", CreatedAt: now})
}

// AcceptURL builds the link mailed to the invitee from the console's base URL,
// which already carries any path prefix — "/admin" when the console is served
// from the public site, nothing when it runs on its own subdomain. It refuses
// anything but a usable origin so a misconfigured base cannot produce an
// invitation pointing somewhere unintended.
func AcceptURL(base, token string) (string, error) {
	origin, err := url.Parse(strings.TrimRight(strings.TrimSpace(base), "/"))
	if err != nil || origin.Host == "" {
		return "", ErrInvalidCredentials
	}
	if origin.Scheme != "https" {
		switch origin.Hostname() {
		case "localhost", "127.0.0.1", "::1":
		default:
			return "", ErrInvalidCredentials
		}
	}
	return fmt.Sprintf("%s/accept-invite?token=%s", origin.String(), url.QueryEscape(token)), nil
}

// nameFromEmail turns the local part of an address into a readable placeholder:
// "ama.boateng@example.com" becomes "Ama Boateng". It is a label for the staff
// list, not an identity claim — the invitee owns their real name.
func nameFromEmail(email string) string {
	local, _, _ := strings.Cut(email, "@")
	local = strings.Map(func(r rune) rune {
		if r == '.' || r == '_' || r == '-' || r == '+' {
			return ' '
		}
		return r
	}, local)
	words := strings.Fields(local)
	for index, word := range words {
		words[index] = strings.ToUpper(word[:1]) + word[1:]
	}
	name := strings.Join(words, " ")
	if name == "" {
		return "New staff member"
	}
	if len(name) > 120 {
		return name[:120]
	}
	return name
}

func (role Role) provisionable() bool {
	switch role {
	case RoleAdministrator, RoleBookingManager, RoleContentEditor, RoleAnalyst:
		return true
	}
	return false
}
