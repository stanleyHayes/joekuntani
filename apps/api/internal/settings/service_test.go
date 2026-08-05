package settings

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

func validValues() Values {
	return Values{Navigation: []Link{{Label: "Home", Href: "/"}}, Footer: []Link{{Label: "Privacy", Href: "/privacy"}}, CTAs: []CTA{{Key: "booking", Title: "Book", Description: "Tell the team what you need.", Label: "Enquire", Href: "/book"}}, Social: []SocialLink{}, Brand: Brand{Name: "Joe Kuntani"}, SEO: SEO{DefaultTitle: "Joe Kuntani"}, Consent: Consent{Version: "draft-v1", PrivacyLabel: "I agree to the privacy notice.", PrivacyURL: "/privacy"}, Integrations: Integration{EmailProvider: "resend"}, Team: Team{BusinessTimezone: "Africa/Accra", NotificationRecipients: []string{"team@example.invalid"}}}
}
func actor(role auth.Role) auth.Principal {
	return auth.Principal{UserID: "actor-public", InternalUserID: "65b25308725d0ab1f12e9361", Role: role, MFAVerified: true}
}
func TestSettingsRoleBoundariesAndOptimisticConcurrency(t *testing.T) {
	values := validValues()
	store := NewMemoryStore(&Document{Key: GlobalKey, Version: 4, Draft: values})
	service := NewService(store, func() time.Time { return time.Unix(100, 0) })
	edited := values
	edited.Brand.Tagline = "Approved tagline"
	updated, err := service.Update(context.Background(), actor(auth.RoleContentEditor), 4, edited, false)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Version != 5 {
		t.Fatalf("version = %d", updated.Version)
	}
	if _, err := service.Update(context.Background(), actor(auth.RoleContentEditor), 4, edited, false); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale update error = %v", err)
	}
	restricted := edited
	restricted.Team.BusinessTimezone = "UTC"
	restricted.Integrations.EmailProvider = "attacker"
	preserved, err := service.Update(context.Background(), actor(auth.RoleContentEditor), 5, restricted, false)
	if err != nil {
		t.Fatal(err)
	}
	if preserved.Draft.Team.BusinessTimezone != "" || preserved.Draft.Integrations.EmailProvider != "" {
		t.Fatal("editor update response exposed administrator-only fields")
	}
	stored, err := store.Get(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if stored.Draft.Team.BusinessTimezone != "Africa/Accra" || stored.Draft.Integrations.EmailProvider != "resend" {
		t.Fatal("editor changed stored administrator-only fields")
	}
	if _, err := service.GetAdmin(context.Background(), actor(auth.RoleAnalyst)); !errors.Is(err, ErrForbidden) {
		t.Fatalf("analyst read error = %v", err)
	}
	editorView, err := service.GetAdmin(context.Background(), actor(auth.RoleContentEditor))
	if err != nil {
		t.Fatal(err)
	}
	if editorView.Draft.Team.BusinessTimezone != "" || editorView.Draft.Integrations.EmailProvider != "" {
		t.Fatal("editor read exposed restricted fields")
	}
}

func TestAdministratorCanInitializeAnEmptyIncompleteDraft(t *testing.T) {
	service := NewService(NewMemoryStore(nil), nil)
	document, err := service.GetAdmin(context.Background(), actor(auth.RoleAdministrator))
	if err != nil {
		t.Fatal(err)
	}
	if document.Version != 0 || document.ContentComplete || document.Key != GlobalKey {
		t.Fatalf("unexpected initial draft: %#v", document)
	}
}
func TestPublishRequiresAdministratorAndCompleteContent(t *testing.T) {
	values := validValues()
	store := NewMemoryStore(&Document{Key: GlobalKey, Version: 1, Draft: values})
	service := NewService(store, nil)
	if _, err := service.Publish(context.Background(), actor(auth.RoleContentEditor), 1); !errors.Is(err, ErrForbidden) {
		t.Fatalf("editor publish error = %v", err)
	}
	if _, err := service.Publish(context.Background(), actor(auth.RoleAdministrator), 1); err == nil {
		t.Fatal("incomplete content published")
	}
	updated, err := service.Update(context.Background(), actor(auth.RoleAdministrator), 1, values, true)
	if err != nil {
		t.Fatal(err)
	}
	published, err := service.Publish(context.Background(), actor(auth.RoleAdministrator), updated.Version)
	if err != nil {
		t.Fatal(err)
	}
	if published.Published == nil || published.Version != 3 {
		t.Fatalf("unexpected published document: %#v", published)
	}
}
func TestPublicProjectionNeverContainsIntegrationsOrTeam(t *testing.T) {
	values := validValues()
	projected := values.Public()
	if projected.Brand.Name != "Joe Kuntani" {
		t.Fatal("brand omitted")
	}
	// Compile-time shape is intentional: PublicValues has no Integrations or Team fields.
}

func TestPublicReadFailsClosedForInvalidStoredPublication(t *testing.T) {
	invalid := validValues()
	invalid.Navigation = nil
	service := NewService(NewMemoryStore(&Document{Key: GlobalKey, Published: &invalid}), nil)
	if _, err := service.GetPublic(context.Background()); err == nil {
		t.Fatal("invalid stored publication was returned")
	}
}
func TestValidationRejectsUnsafeAndIncompleteValues(t *testing.T) {
	values := validValues()
	values.Navigation[0].Href = "javascript:alert(1)"
	if Validate(values) == nil {
		t.Fatal("unsafe URL accepted")
	}
	values = validValues()
	values.Social = []SocialLink{{Platform: "example", URL: "http://example.com"}}
	if Validate(values) == nil {
		t.Fatal("insecure social URL accepted")
	}
}

func TestValidationMatchesOrExceedsPublishedContract(t *testing.T) {
	tests := map[string]func(*Values){
		"null navigation":           func(v *Values) { v.Navigation = nil },
		"null footer":               func(v *Values) { v.Footer = nil },
		"null CTAs":                 func(v *Values) { v.CTAs = nil },
		"null social":               func(v *Values) { v.Social = nil },
		"null recipients":           func(v *Values) { v.Team.NotificationRecipients = nil },
		"link label too long":       func(v *Values) { v.Navigation[0].Label = strings.Repeat("a", 81) },
		"link href too long":        func(v *Values) { v.Navigation[0].Href = "/" + strings.Repeat("a", 2048) },
		"CTA label too long":        func(v *Values) { v.CTAs[0].Label = strings.Repeat("a", 81) },
		"CTA href too long":         func(v *Values) { v.CTAs[0].Href = "/" + strings.Repeat("a", 2048) },
		"canonical too long":        func(v *Values) { v.SEO.CanonicalBase = "https://example.test/" + strings.Repeat("a", 2030) },
		"consent version too long":  func(v *Values) { v.Consent.Version = strings.Repeat("a", 81) },
		"privacy label too long":    func(v *Values) { v.Consent.PrivacyLabel = strings.Repeat("a", 501) },
		"marketing label too long":  func(v *Values) { v.Consent.MarketingLabel = strings.Repeat("a", 501) },
		"privacy URL too long":      func(v *Values) { v.Consent.PrivacyURL = "/" + strings.Repeat("a", 2048) },
		"timezone too long":         func(v *Values) { v.Team.BusinessTimezone = strings.Repeat("a", 101) },
		"invalid logo UUID":         func(v *Values) { v.Brand.LogoAssetID = "not-a-uuid" },
		"invalid favicon UUID":      func(v *Values) { v.Brand.FaviconAssetID = "not-a-uuid" },
		"invalid social image UUID": func(v *Values) { v.SEO.SocialImageID = "not-a-uuid" },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			values := validValues()
			mutate(&values)
			if Validate(values) == nil {
				t.Fatal("invalid settings accepted")
			}
		})
	}
	values := validValues()
	values.Brand.LogoAssetID = "018f47f6-9f5d-7d3a-8d4e-45f0f7d4c111"
	values.Brand.FaviconAssetID = "018f47f6-9f5d-7d3a-8d4e-45f0f7d4c112"
	values.SEO.SocialImageID = "018f47f6-9f5d-7d3a-8d4e-45f0f7d4c113"
	if err := Validate(values); err != nil {
		t.Fatalf("valid UUID references rejected: %v", err)
	}
}
