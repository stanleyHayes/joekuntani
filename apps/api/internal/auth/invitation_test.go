package auth

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func inviteFixture(t *testing.T) (*Service, *MemoryStore, Principal) {
	t.Helper()
	store := NewMemoryStore()
	service := NewService(store, func() time.Time { return time.Date(2026, 8, 7, 12, 0, 0, 0, time.UTC) }, time.Hour)
	return service, store, Principal{InternalUserID: "admin-1", Role: RoleAdministrator, MFAVerified: true}
}

func TestInviteStaffLeavesAccountUnusableUntilAccepted(t *testing.T) {
	service, store, admin := inviteFixture(t)

	invitation, token, err := service.InviteStaff(context.Background(), admin, ProvisionInput{
		Name: "Ama Mensah", Email: "Ama@Example.com", Role: RoleContentEditor,
	})
	if err != nil {
		t.Fatalf("invite: %v", err)
	}
	if invitation.Email != "ama@example.com" {
		t.Fatalf("email should be normalised, got %q", invitation.Email)
	}
	if token == "" {
		t.Fatal("expected an acceptance token")
	}

	var invited User
	for _, user := range store.Users {
		if user.Email == "ama@example.com" {
			invited = user
		}
	}
	if invited.Status != "invited" {
		t.Fatalf("status = %q, want invited", invited.Status)
	}
	// The whole point of the flow: no credential exists for this account yet.
	if invited.PasswordHash != "" {
		t.Fatal("an invited account must not carry a password hash")
	}
	if _, err := service.Login(context.Background(), Credentials{Email: "ama@example.com", Password: "anything-at-all"}); err == nil {
		t.Fatal("an invited account must not authenticate")
	}
}

func TestAcceptInvitationActivatesAndIsSingleUse(t *testing.T) {
	service, store, admin := inviteFixture(t)
	_, token, err := service.InviteStaff(context.Background(), admin, ProvisionInput{
		Name: "Ama Mensah", Email: "ama@example.com", Role: RoleContentEditor,
	})
	if err != nil {
		t.Fatalf("invite: %v", err)
	}

	if err := service.AcceptInvitation(context.Background(), token, "short"); err == nil {
		t.Fatal("a weak password must be rejected")
	}
	if err := service.AcceptInvitation(context.Background(), token, "correct-horse-battery"); err != nil {
		t.Fatalf("accept: %v", err)
	}

	var activated User
	for _, user := range store.Users {
		if user.Email == "ama@example.com" {
			activated = user
		}
	}
	if activated.Status != "active" {
		t.Fatalf("status = %q, want active", activated.Status)
	}
	if !VerifyPassword(activated.PasswordHash, "correct-horse-battery") {
		t.Fatal("the chosen password should verify after acceptance")
	}
	// Replaying the link must not let anyone reset the password again.
	if err := service.AcceptInvitation(context.Background(), token, "another-password-entirely"); err == nil {
		t.Fatal("an accepted invitation must not be reusable")
	}
	if !VerifyPassword(activated.PasswordHash, "correct-horse-battery") {
		t.Fatal("the replay must not have changed the stored password")
	}
}

func TestInvitationRejectsExpiredAndUnknownTokens(t *testing.T) {
	now := time.Date(2026, 8, 7, 12, 0, 0, 0, time.UTC)
	store := NewMemoryStore()
	service := NewService(store, func() time.Time { return now }, time.Hour)
	admin := Principal{InternalUserID: "admin-1", Role: RoleAdministrator, MFAVerified: true}

	_, token, err := service.InviteStaff(context.Background(), admin, ProvisionInput{
		Name: "Ama Mensah", Email: "ama@example.com", Role: RoleAnalyst,
	})
	if err != nil {
		t.Fatalf("invite: %v", err)
	}
	if _, err := service.Invitation(context.Background(), "not-a-real-token"); err == nil {
		t.Fatal("an unknown token must not resolve")
	}
	if _, err := service.Invitation(context.Background(), ""); err == nil {
		t.Fatal("an empty token must not resolve")
	}

	now = now.Add(InvitationLifetime + time.Minute)
	if _, err := service.Invitation(context.Background(), token); err == nil {
		t.Fatal("an expired invitation must not resolve")
	}
	if err := service.AcceptInvitation(context.Background(), token, "correct-horse-battery"); err == nil {
		t.Fatal("an expired invitation must not be acceptable")
	}
}

func TestInviteStaffRequiresPermissionAndValidInput(t *testing.T) {
	service, _, _ := inviteFixture(t)
	analyst := Principal{InternalUserID: "analyst-1", Role: RoleAnalyst, MFAVerified: true}

	if _, _, err := service.InviteStaff(context.Background(), analyst, ProvisionInput{
		Name: "Ama", Email: "ama@example.com", Role: RoleAnalyst,
	}); err == nil {
		t.Fatal("a role without users:manage must not invite staff")
	}

	admin := Principal{InternalUserID: "admin-1", Role: RoleAdministrator, MFAVerified: true}
	for _, input := range []ProvisionInput{
		{Name: "Ama", Email: "not-an-email", Role: RoleAnalyst},
		{Name: "Ama", Email: "", Role: RoleAnalyst},
		{Name: "Ama", Email: "ama@example.com", Role: Role("superuser")},
		{Name: strings.Repeat("a", 121), Email: "ama@example.com", Role: RoleAnalyst},
	} {
		if _, _, err := service.InviteStaff(context.Background(), admin, input); err == nil {
			t.Fatalf("expected rejection for %+v", input)
		}
	}
}

// An administrator supplies an address and a role. Requiring a name too meant
// inviting anyone involved guessing how they spell it.
func TestInviteStaffAcceptsEmailAndRoleAlone(t *testing.T) {
	service, _, admin := inviteFixture(t)
	invitation, token, err := service.InviteStaff(context.Background(), admin, ProvisionInput{
		Email: "ama.boateng@example.com", Role: RoleAnalyst,
	})
	if err != nil {
		t.Fatalf("invite: %v", err)
	}
	if token == "" {
		t.Fatal("no token issued")
	}
	if invitation.Name != "Ama Boateng" {
		t.Fatalf("placeholder name = %q", invitation.Name)
	}
}

func TestNameFromEmailReadsAsALabel(t *testing.T) {
	for email, want := range map[string]string{
		"ama.boateng@example.com": "Ama Boateng",
		"kojo_mensah@example.com": "Kojo Mensah",
		"joe-kuntani@example.com": "Joe Kuntani",
		"bookings@example.com":    "Bookings",
		"@example.com":            "New staff member",
	} {
		if got := nameFromEmail(email); got != want {
			t.Fatalf("nameFromEmail(%q) = %q, want %q", email, got, want)
		}
	}
}

// The window is the security property: a forwarded or archived invitation must
// be worthless long before anyone else reads the message.
func TestInvitationLifetimeIsFifteenMinutes(t *testing.T) {
	if InvitationLifetime != 15*time.Minute {
		t.Fatalf("InvitationLifetime = %v", InvitationLifetime)
	}
	service, _, admin := inviteFixture(t)
	invitation, _, err := service.InviteStaff(context.Background(), admin, ProvisionInput{
		Email: "ama@example.com", Role: RoleAnalyst,
	})
	if err != nil {
		t.Fatalf("invite: %v", err)
	}
	if got := invitation.ExpiresAt.Sub(service.now().UTC()); got != 15*time.Minute {
		t.Fatalf("expiry window = %v", got)
	}
}

func TestTokenIsNeverStoredInTheClear(t *testing.T) {
	service, store, admin := inviteFixture(t)
	_, token, err := service.InviteStaff(context.Background(), admin, ProvisionInput{
		Name: "Ama Mensah", Email: "ama@example.com", Role: RoleAnalyst,
	})
	if err != nil {
		t.Fatalf("invite: %v", err)
	}
	if _, ok := store.Invitations[token]; ok {
		t.Fatal("the raw token must not be a stored key")
	}
	if _, ok := store.Invitations[HashInvitationToken(token)]; !ok {
		t.Fatal("the invitation should be keyed by its hash")
	}
}

func TestAcceptURLRefusesUntrustedOrigins(t *testing.T) {
	// The base carries whatever prefix the console is served under, so the same
	// builder serves both topologies: under /admin on the public site, and at
	// the root of its own subdomain.
	for base, want := range map[string]string{
		"https://joekuntani.com/admin":  "https://joekuntani.com/admin/accept-invite?token=",
		"https://admin.joekuntani.com":  "https://admin.joekuntani.com/accept-invite?token=",
		"https://admin.joekuntani.com/": "https://admin.joekuntani.com/accept-invite?token=",
	} {
		built, buildErr := AcceptURL(base, "token")
		if buildErr != nil {
			t.Fatalf("%s: %v", base, buildErr)
		}
		if !strings.HasPrefix(built, want) {
			t.Fatalf("AcceptURL(%q) = %q, want prefix %q", base, built, want)
		}
	}

	link, err := AcceptURL("https://joekuntani.com/admin", "tok en/value")
	if err != nil {
		t.Fatalf("https origin: %v", err)
	}
	if strings.Contains(link, " ") || strings.Contains(link, "tok en") {
		t.Fatalf("token should be query-escaped, got %q", link)
	}
	if _, err := AcceptURL("http://joekuntani.com", "token"); err == nil {
		t.Fatal("plain http on a public host must be refused")
	}
	if _, err := AcceptURL("http://localhost:3000", "token"); err != nil {
		t.Fatalf("loopback should be allowed for local development: %v", err)
	}
	if _, err := AcceptURL("", "token"); err == nil {
		t.Fatal("an empty origin must be refused")
	}
}

// Inviting always wrote a users row against a unique email index, so once a
// link lapsed the address was locked out of the platform permanently — there is
// no reissue path. A 72-hour window made that rare; the 15-minute window makes
// it the ordinary case, so re-inviting an address that never accepted has to
// supersede the old invitation rather than collide with it.
func TestLapsedInvitationCanBeReissuedToTheSameAddress(t *testing.T) {
	service, store, admin := inviteFixture(t)
	input := ProvisionInput{Email: "ama@example.com", Role: RoleAnalyst}

	first, firstToken, err := service.InviteStaff(context.Background(), admin, input)
	if err != nil {
		t.Fatalf("first invite: %v", err)
	}

	second, secondToken, err := service.InviteStaff(context.Background(), admin, input)
	if err != nil {
		t.Fatalf("reissue rejected, address is locked out: %v", err)
	}
	if second.UserID != first.UserID {
		t.Fatalf("reissue created a second account: %q vs %q", second.UserID, first.UserID)
	}
	if secondToken == firstToken {
		t.Fatal("reissue handed back the same token")
	}

	// Only the newest link may work, or an invitation is effectively multi-use.
	if _, err = service.Invitation(context.Background(), firstToken); err == nil {
		t.Fatal("the superseded link still resolves")
	}
	if _, err = service.Invitation(context.Background(), secondToken); err != nil {
		t.Fatalf("the reissued link does not resolve: %v", err)
	}
	if got := len(store.Users); got != 1 {
		t.Fatalf("users = %d, want the invite reused one row", got)
	}
}

// Reissuing against a live account would let anyone who can post an invite
// reset an administrator's credentials.
func TestInvitingAnAcceptedAddressStaysAConflict(t *testing.T) {
	service, _, admin := inviteFixture(t)
	input := ProvisionInput{Email: "ama@example.com", Role: RoleAnalyst}

	_, token, err := service.InviteStaff(context.Background(), admin, input)
	if err != nil {
		t.Fatalf("invite: %v", err)
	}
	if err = service.AcceptInvitation(context.Background(), token, "correct-horse-battery"); err != nil {
		t.Fatalf("accept: %v", err)
	}
	if _, _, err = service.InviteStaff(context.Background(), admin, input); !errors.Is(err, ErrConflict) {
		t.Fatalf("InviteStaff = %v, want ErrConflict for an accepted account", err)
	}
}
