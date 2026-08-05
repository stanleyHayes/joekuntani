package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha1" // #nosec G505 -- test generation for RFC-compatible TOTP.
	"encoding/base32"
	"encoding/binary"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

const testMFASecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"

func testService(t *testing.T, role Role, mfa bool) (*Service, *MemoryStore, time.Time, string) {
	t.Helper()
	password := "correct horse battery staple"
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 8, 5, 14, 0, 0, 0, time.UTC)
	store := NewMemoryStore(User{ID: "user-1", PublicID: "018f47f6-9f5d-7d3a-8d4e-45f0f7d4c201", Name: "Staff member", Email: "staff@example.invalid", PasswordHash: hash, Role: role, MFAEnabled: mfa, MFASecret: map[bool]string{true: testMFASecret}[mfa], Status: "active", UpdatedAt: now})
	return NewService(store, func() time.Time { return now }, time.Hour), store, now, password
}

func TestAdministratorRequiresMFAAndSessionRotates(t *testing.T) {
	service, _, now, password := testService(t, RoleAdministrator, true)
	tokens, err := service.Login(context.Background(), Credentials{Email: " STAFF@EXAMPLE.INVALID ", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	if !tokens.MFARequired {
		t.Fatal("administrator login did not require MFA")
	}
	if _, _, err := service.Authenticate(context.Background(), tokens.Session); err != ErrMFARequired {
		t.Fatalf("pre-MFA authentication error = %v", err)
	}
	rotated, err := service.CompleteMFA(context.Background(), tokens.Session, totpCode(testMFASecret, now))
	if err != nil {
		t.Fatal(err)
	}
	if rotated.Session == tokens.Session || rotated.CSRF == tokens.CSRF {
		t.Fatal("MFA did not rotate session and CSRF tokens")
	}
	if _, _, err := service.Authenticate(context.Background(), tokens.Session); err != ErrUnauthorized {
		t.Fatalf("old session remained valid: %v", err)
	}
	principal, session, err := service.Authenticate(context.Background(), rotated.Session)
	if err != nil {
		t.Fatal(err)
	}
	if !principal.MFAVerified || service.ValidateCSRF(session, rotated.CSRF) != nil {
		t.Fatal("verified session missing MFA or CSRF binding")
	}
}

func TestTOTPIsConsumedOnceAcrossConcurrentSessions(t *testing.T) {
	service, _, now, password := testService(t, RoleAdministrator, true)
	first, err := service.Login(context.Background(), Credentials{Email: "staff@example.invalid", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Login(context.Background(), Credentials{Email: "staff@example.invalid", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	var wait sync.WaitGroup
	for _, token := range []string{first.Session, second.Session} {
		token := token
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			_, err := service.CompleteMFA(context.Background(), token, totpCode(testMFASecret, now))
			results <- err
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent MFA successes = %d, want exactly 1", successes)
	}
}

func TestSensitiveActionsFailClosedWhenAuditCannotPersist(t *testing.T) {
	service, store, _, password := testService(t, RoleContentEditor, false)
	store.AuditError = errors.New("audit offline")
	if _, err := service.Login(context.Background(), Credentials{Email: "staff@example.invalid", Password: password}); err != ErrSecurityUnavailable {
		t.Fatalf("login error = %v", err)
	}
	if len(store.Sessions) != 0 {
		t.Fatal("session persisted without audit")
	}
	if _, err := service.Login(context.Background(), Credentials{Email: "missing@example.invalid", Password: password}); err != ErrSecurityUnavailable {
		t.Fatalf("denied-login audit error = %v", err)
	}
}

func TestMFAStateDoesNotAdvanceWhenAuditCannotPersist(t *testing.T) {
	service, store, now, password := testService(t, RoleAdministrator, true)
	tokens, err := service.Login(context.Background(), Credentials{Email: "staff@example.invalid", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	store.AuditError = errors.New("audit offline")
	if _, err := service.CompleteMFA(context.Background(), tokens.Session, totpCode(testMFASecret, now)); err != ErrSecurityUnavailable {
		t.Fatalf("MFA error = %v", err)
	}
	store.AuditError = nil
	if _, err := service.CompleteMFA(context.Background(), tokens.Session, totpCode(testMFASecret, now)); err != nil {
		t.Fatalf("MFA state advanced despite rollback: %v", err)
	}
}

func TestExactRolePermissionMatrix(t *testing.T) {
	all := []Permission{PermissionAdminAccess, PermissionUsersManage, PermissionContentEdit, PermissionEnquiriesManage, PermissionProposalsManage, PermissionBookingsManage, PermissionContactsManage, PermissionNotesManage, PermissionTasksManage, PermissionStatusManage, PermissionDashboardsRead, PermissionReportsExport, PermissionFinancialRecords}
	for _, permission := range all {
		if !RoleAdministrator.Allows(permission) {
			t.Errorf("administrator denied %s", permission)
		}
	}
	booking := []Permission{PermissionEnquiriesManage, PermissionProposalsManage, PermissionBookingsManage, PermissionContactsManage, PermissionNotesManage, PermissionTasksManage, PermissionStatusManage}
	for _, permission := range booking {
		if !RoleBookingManager.Allows(permission) {
			t.Errorf("booking manager denied %s", permission)
		}
	}
	for _, permission := range []Permission{PermissionUsersManage, PermissionContentEdit, PermissionReportsExport, PermissionFinancialRecords} {
		if RoleBookingManager.Allows(permission) {
			t.Errorf("booking manager allowed %s", permission)
		}
	}
	if !RoleContentEditor.Allows(PermissionContentEdit) || RoleContentEditor.Allows(PermissionUsersManage) || RoleContentEditor.Allows(PermissionFinancialRecords) {
		t.Fatal("content editor matrix is incorrect")
	}
	if !RoleAnalyst.Allows(PermissionDashboardsRead) || !RoleAnalyst.Allows(PermissionReportsExport) || RoleAnalyst.Allows(PermissionContentEdit) || RoleAnalyst.Allows(PermissionUsersManage) {
		t.Fatal("analyst matrix is incorrect")
	}
}

func TestAdministratorWithoutMFAConfigurationCannotLogin(t *testing.T) {
	service, store, _, password := testService(t, RoleAdministrator, false)
	_, err := service.Login(context.Background(), Credentials{Email: "staff@example.invalid", Password: password})
	if err != ErrMFARequired || len(store.Sessions) != 0 {
		t.Fatalf("login = %v, sessions = %d", err, len(store.Sessions))
	}
}

func TestRBACDisableRevokesEverySession(t *testing.T) {
	service, store, now, password := testService(t, RoleAdministrator, true)
	// Non-administrator staff can authenticate but cannot manage users.
	store.Users["manager"] = User{ID: "manager", PublicID: "018f47f6-9f5d-7d3a-8d4e-45f0f7d4c202", Email: "manager@example.invalid", PasswordHash: store.Users["user-1"].PasswordHash, Role: RoleBookingManager, Status: "active", UpdatedAt: now}
	managerTokens, err := service.Login(context.Background(), Credentials{Email: "manager@example.invalid", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	manager, _, err := service.Authenticate(context.Background(), managerTokens.Session)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.DisableUser(context.Background(), manager, "018f47f6-9f5d-7d3a-8d4e-45f0f7d4c201"); err != ErrForbidden {
		t.Fatalf("manager disable error = %v", err)
	}

	adminTokens, err := service.Login(context.Background(), Credentials{Email: "staff@example.invalid", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	adminTokens, err = service.CompleteMFA(context.Background(), adminTokens.Session, totpCode(testMFASecret, now))
	if err != nil {
		t.Fatal(err)
	}
	admin, _, err := service.Authenticate(context.Background(), adminTokens.Session)
	if err != nil {
		t.Fatal(err)
	}
	secondTokens, err := service.Login(context.Background(), Credentials{Email: "manager@example.invalid", Password: password})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.DisableUser(context.Background(), admin, "018f47f6-9f5d-7d3a-8d4e-45f0f7d4c202"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := service.Authenticate(context.Background(), secondTokens.Session); err != ErrUnauthorized {
		t.Fatalf("disabled user session error = %v", err)
	}
	if store.Users["manager"].Status != "disabled" {
		t.Fatal("user was not disabled")
	}
	if len(store.Audits) == 0 || store.Audits[len(store.Audits)-1].Action != "user.disable" {
		t.Fatal("disable audit was not emitted")
	}
}

func TestPasswordHashAndSecretEncryption(t *testing.T) {
	hash, err := HashPassword("a sufficiently long password")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword(hash, "a sufficiently long password") || VerifyPassword(hash, "wrong password") {
		t.Fatal("Argon2id verification mismatch")
	}
	box, err := NewSecretBox("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY")
	if err != nil {
		t.Fatal(err)
	}
	encrypted, err := box.Encrypt(testMFASecret)
	if err != nil {
		t.Fatal(err)
	}
	if encrypted == testMFASecret {
		t.Fatal("secret stored as plaintext")
	}
	plain, err := box.Decrypt(encrypted)
	if err != nil || plain != testMFASecret {
		t.Fatalf("decrypt = %q, %v", plain, err)
	}
}

func totpCode(secret string, now time.Time) string {
	key, _ := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	message := make([]byte, 8)
	binary.BigEndian.PutUint64(message, uint64(now.Unix()/30))
	mac := hmac.New(sha1.New, key)
	_, _ = mac.Write(message)
	digest := mac.Sum(nil)
	offset := digest[len(digest)-1] & 0xf
	value := (uint32(digest[offset])&0x7f)<<24 | uint32(digest[offset+1])<<16 | uint32(digest[offset+2])<<8 | uint32(digest[offset+3])
	return fmt.Sprintf("%06d", value%1_000_000)
}
