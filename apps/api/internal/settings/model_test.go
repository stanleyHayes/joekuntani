package settings

import "testing"

// The starter draft is what an administrator saves first. If it cannot pass
// Validate, the very first "Save draft" on a new installation is rejected.
func TestStarterValuesPassValidation(t *testing.T) {
	if err := Validate(StarterValues()); err != nil {
		t.Fatalf("starter values must be valid: %v", err)
	}
}

// The starter draft must not carry contact details that work if it is published
// without review, and must not invent internal recipients.
func TestStarterValuesUsePlaceholderContact(t *testing.T) {
	values := StarterValues()
	if values.Contact.PublicEmail != "bookings@example.com" {
		t.Fatalf("public email must stay a reserved placeholder, got %q", values.Contact.PublicEmail)
	}
	if len(values.Team.NotificationRecipients) != 0 {
		t.Fatalf("notification recipients must start empty, got %v", values.Team.NotificationRecipients)
	}
}

// Every seeded link must be a route the site serves, expressed as a same-origin
// path so no starter link points off the site.
func TestStarterValuesLinkToLocalRoutes(t *testing.T) {
	values := StarterValues()
	routes := map[string]bool{
		"/work": true, "/services": true, "/events": true, "/videos": true,
		"/about": true, "/contact": true, "/book": true, "/press": true,
		"/media-kit": true, "/privacy": true, "/terms": true,
	}
	links := append(append([]Link{}, values.Navigation...), values.Footer...)
	for _, item := range values.CTAs {
		links = append(links, Link{Label: item.Label, Href: item.Href})
	}
	links = append(links, Link{Label: "consent", Href: values.Consent.PrivacyURL})
	for _, link := range links {
		if !routes[link.Href] {
			t.Fatalf("starter link %q points at %q, which is not a served route", link.Label, link.Href)
		}
	}
}
