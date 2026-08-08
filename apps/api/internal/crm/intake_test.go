package crm

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

type stubPending struct {
	items []PendingEnquiry
	err   error
	calls int
}

func (s *stubPending) Unfiled(context.Context, int) ([]PendingEnquiry, error) {
	s.calls++
	return s.items, s.err
}

func intakeFixture(t *testing.T) (*IntakeWorker, *MemoryStore, *stubPending) {
	t.Helper()
	store := NewMemoryStore()
	service := NewService(store, func() time.Time { return time.Date(2026, 8, 7, 12, 0, 0, 0, time.UTC) }, UUID)
	pending := &stubPending{}
	return NewIntakeWorker(pending, store, service), store, pending
}

func seedSource(store *MemoryStore, id string, contact SourceContact) {
	store.SeedSource(SourceEnquiry{
		PublicID:    id,
		Reference:   "JK-2026-ABC123",
		ServiceID:   "00000000-0000-4000-8000-000000000077",
		Source:      "referral",
		EnquiryType: "event",
		Contact:     contact,
	})
}

const sourceA = "00000000-0000-4000-8000-0000000000a1"
const sourceB = "00000000-0000-4000-8000-0000000000b2"

// The whole point of the worker: a public submission that no console screen
// could see becomes a CRM lead at the `new` stage.
func TestIntakePromotesUnfiledEnquiry(t *testing.T) {
	worker, store, pending := intakeFixture(t)
	seedSource(store, sourceA, SourceContact{Name: "Ama Boateng", Email: "ama@example.com", Phone: "+233200000000", Organization: "Kori Studios", Role: "Producer", Country: "GH"})
	pending.items = []PendingEnquiry{{PublicID: sourceA, ProjectBrief: "Two guitar sets for a launch night."}}

	if err := worker.RunOnce(context.Background(), 10); err != nil {
		t.Fatalf("RunOnce = %v", err)
	}
	filed, err := store.ListEnquiries(context.Background(), EnquiryFilter{})
	if err != nil || len(filed) != 1 {
		t.Fatalf("filed = %d, %v", len(filed), err)
	}
	item := filed[0]
	if item.SourceEnquiryID != sourceA || item.Stage != StageNew || item.Reference != "JK-2026-ABC123" {
		t.Fatalf("unexpected lead: %#v", item)
	}
	if item.Summary != "Two guitar sets for a launch night." {
		t.Fatalf("summary = %q", item.Summary)
	}
	if item.ContactID == "" || item.OrganizationID == "" {
		t.Fatalf("contact/organization not linked: %#v", item)
	}
}

// Individuals book too. A missing organization must not stop the lead.
func TestIntakePromotesContactWithoutOrganization(t *testing.T) {
	worker, store, pending := intakeFixture(t)
	seedSource(store, sourceA, SourceContact{Name: "Kojo Mensah", Email: "kojo@example.com", Role: "Host", Country: "GH"})
	pending.items = []PendingEnquiry{{PublicID: sourceA}}

	if err := worker.RunOnce(context.Background(), 10); err != nil {
		t.Fatalf("RunOnce = %v", err)
	}
	filed, _ := store.ListEnquiries(context.Background(), EnquiryFilter{})
	if len(filed) != 1 || filed[0].OrganizationID != "" {
		t.Fatalf("unexpected lead: %#v", filed)
	}
}

// A second pass over the same submission must not file a duplicate lead — the
// worker re-runs every 15 seconds, so this is the common case, not an edge one.
func TestIntakeIsIdempotentForAlreadyFiledEnquiry(t *testing.T) {
	worker, store, pending := intakeFixture(t)
	seedSource(store, sourceA, SourceContact{Name: "Ama Boateng", Email: "ama@example.com", Country: "GH"})
	pending.items = []PendingEnquiry{{PublicID: sourceA}}

	if err := worker.RunOnce(context.Background(), 10); err != nil {
		t.Fatalf("first RunOnce = %v", err)
	}
	// The real lister would stop returning this row; a stub that keeps
	// returning it proves the store's own guard holds too.
	if err := worker.RunOnce(context.Background(), 10); err != nil && !errors.Is(err, ErrConflict) {
		t.Fatalf("second RunOnce = %v", err)
	}
	filed, _ := store.ListEnquiries(context.Background(), EnquiryFilter{})
	if len(filed) != 1 {
		t.Fatalf("filed %d leads, want 1", len(filed))
	}
}

// Two submissions from the same person share one contact record rather than
// splintering the CRM into duplicates.
func TestIntakeReusesExistingContact(t *testing.T) {
	worker, store, pending := intakeFixture(t)
	contact := SourceContact{Name: "Ama Boateng", Email: "ama@example.com", Country: "GH"}
	seedSource(store, sourceA, contact)
	seedSource(store, sourceB, contact)
	pending.items = []PendingEnquiry{{PublicID: sourceA}, {PublicID: sourceB}}

	if err := worker.RunOnce(context.Background(), 10); err != nil {
		t.Fatalf("RunOnce = %v", err)
	}
	filed, _ := store.ListEnquiries(context.Background(), EnquiryFilter{})
	if len(filed) != 2 {
		t.Fatalf("filed %d leads, want 2", len(filed))
	}
	if filed[0].ContactID != filed[1].ContactID {
		t.Fatalf("contacts diverged: %q vs %q", filed[0].ContactID, filed[1].ContactID)
	}
}

// A returning enquirer who types their employer differently must not mint a
// second organization. Resolving the organization before the contact created a
// record the lead then ignored, because the lead has to inherit the contact's
// existing organization.
func TestIntakeDoesNotCreateOrphanOrganizationForKnownContact(t *testing.T) {
	worker, store, pending := intakeFixture(t)
	seedSource(store, sourceA, SourceContact{Name: "Ama Boateng", Email: "ama@example.com", Organization: "Kori", Country: "GH"})
	seedSource(store, sourceB, SourceContact{Name: "Ama Boateng", Email: "ama@example.com", Organization: "Kori Studios", Country: "GH"})
	pending.items = []PendingEnquiry{{PublicID: sourceA}, {PublicID: sourceB}}

	if err := worker.RunOnce(context.Background(), 10); err != nil {
		t.Fatalf("RunOnce = %v", err)
	}
	if _, err := store.FindOrganizationByNormalizedName(context.Background(), normalizeOrganizationName("Kori Studios")); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an organization the lead cannot use was created: %v", err)
	}
	filed, _ := store.ListEnquiries(context.Background(), EnquiryFilter{})
	if len(filed) != 2 || filed[0].OrganizationID != filed[1].OrganizationID {
		t.Fatalf("leads disagree on organization: %#v", filed)
	}
}

// One unusable submission must not block the queue behind it.
func TestIntakeSkipsFailureAndKeepsGoing(t *testing.T) {
	worker, store, pending := intakeFixture(t)
	seedSource(store, sourceB, SourceContact{Name: "Kojo Mensah", Email: "kojo@example.com", Country: "GH"})
	pending.items = []PendingEnquiry{{PublicID: "00000000-0000-4000-8000-00000000dead"}, {PublicID: sourceB}}

	err := worker.RunOnce(context.Background(), 10)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("RunOnce = %v, want the skipped failure reported", err)
	}
	filed, _ := store.ListEnquiries(context.Background(), EnquiryFilter{})
	if len(filed) != 1 || filed[0].SourceEnquiryID != sourceB {
		t.Fatalf("the healthy enquiry was not promoted: %#v", filed)
	}
}

func TestIntakeRejectsOutOfRangeLimit(t *testing.T) {
	worker, _, pending := intakeFixture(t)
	for _, limit := range []int{0, -1, 501} {
		if err := worker.RunOnce(context.Background(), limit); !errors.Is(err, ErrInvalid) {
			t.Fatalf("limit %d = %v, want ErrInvalid", limit, err)
		}
	}
	if pending.calls != 0 {
		t.Fatalf("queried the database for an invalid limit")
	}
}

// The system actor must be able to write, and must be distinguishable from a
// signed-in administrator in the audit trail.
func TestSystemIntakeActorWritesAsMachine(t *testing.T) {
	actor := SystemIntakeActor()
	if !actor.Allows(PermissionWrite) || !actor.Allows(PermissionRead) {
		t.Fatal("system actor cannot file leads")
	}
	if actor.Allows(PermissionPrivacyDelete) || actor.Allows(PermissionAssign) {
		t.Fatal("system actor holds more than intake needs")
	}
	if actor.InternalID != "000000000000000000000000" {
		t.Fatalf("actor id = %q", actor.InternalID)
	}
}

// The store's cap is 2000 measured three ways: valid UTF-8, at most 2000 runes,
// and at most 2000 bytes. Slicing at byte 1999 and appending a 3-byte ellipsis
// produced 2002 bytes and could cut a character in half, so every enquiry with
// a long brief was rejected — and intake works oldest-first, so each reject
// head-blocked the queue behind it.
func TestSummarizeAlwaysFitsTheStoreLimit(t *testing.T) {
	for _, brief := range []string{
		strings.Repeat("x", 2500),
		strings.Repeat("é", 2500),
		strings.Repeat("音", 2500),
		strings.Repeat("🎸", 1200),
	} {
		got := summarize(brief)
		if !bounded(got, 0, 2000) {
			t.Fatalf("summary rejected by the store: runes=%d bytes=%d valid=%v",
				utf8.RuneCountInString(got), len(got), utf8.ValidString(got))
		}
	}
	if got := summarize("  brief  "); got != "brief" {
		t.Fatalf("summary = %q", got)
	}
}

// The enquiry form accepts phone numbers the CRM contact validator rejects.
// Failing the promotion meant retrying that enquiry every 15 seconds forever.
func TestContactPhoneDropsNumbersTheCRMCannotStore(t *testing.T) {
	if got := contactPhone("+233200000000"); got == "" {
		t.Fatal("a usable number was dropped")
	}
	for _, unusable := range []string{"123", "", strings.Repeat("9", 40)} {
		if got := contactPhone(unusable); got != "" {
			t.Fatalf("contactPhone(%q) = %q, want it dropped", unusable, got)
		}
	}
}
