package crm

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func fixture(t *testing.T) (*Service, *MemoryStore, Actor) {
	t.Helper()
	store := NewMemoryStore()
	store.SeedSource(SourceEnquiry{PublicID: "00000000-0000-4000-8000-000000000099", Reference: "JK-AUTHORITATIVE", ServiceID: "00000000-0000-4000-8000-000000000077", Source: "referral", EnquiryType: "event", Contact: SourceContact{Name: "Source Person", Email: "source@example.com", Phone: "+233200000000", Organization: "Source Org", Role: "Manager", Country: "GH"}})
	n := 0
	id := func() (string, error) { n++; return fmt.Sprintf("00000000-0000-4000-8000-%012d", n), nil }
	now := func() time.Time { return time.Date(2026, 8, 5, 17, 0, 0, 0, time.UTC) }
	actor := Actor{InternalID: "staff", Permissions: map[Permission]bool{PermissionRead: true, PermissionWrite: true, PermissionAssign: true, PermissionPrivacyExport: true, PermissionPrivacyDelete: true}}
	return NewService(store, now, id), store, actor
}
func TestOrganizationsContactsNormalizedLookupAndAudit(t *testing.T) {
	service, store, actor := fixture(t)
	ctx := context.Background()
	org, err := service.CreateOrganization(ctx, actor, OrganizationInput{Name: "  Neurodyne ", Website: "https://example.com", CountryCode: "gh"})
	if err != nil {
		t.Fatal(err)
	}
	if org.Name != "Neurodyne" || org.NormalizedName != "neurodyne" {
		t.Fatalf("organization normalization = %#v", org)
	}
	if _, err = service.CreateOrganization(ctx, actor, OrganizationInput{Name: "  NEURODYNE\t\n"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("organization duplicate = %v", err)
	}
	if found, lookupErr := service.LookupOrganization(ctx, actor, " neurodyne "); lookupErr != nil || found.PublicID != org.PublicID {
		t.Fatalf("organization lookup = %#v %v", found, lookupErr)
	}
	contact, err := service.CreateContact(ctx, actor, ContactInput{OrganizationID: org.PublicID, Name: " Ama Mensah ", Email: " AMA@Example.COM ", Phone: "+233 (24) 123-4567", CountryCode: "gh"})
	if err != nil {
		t.Fatal(err)
	}
	if contact.NormalizedEmail != "ama@example.com" || contact.NormalizedPhone != "+233241234567" {
		t.Fatalf("not normalized: %#v", contact)
	}
	found, err := service.LookupContact(ctx, actor, " ama@EXAMPLE.com ", "")
	if err != nil || found.PublicID != contact.PublicID {
		t.Fatalf("lookup: %#v %v", found, err)
	}
	if _, err = service.CreateContact(ctx, actor, ContactInput{Name: "Duplicate", Email: "ama@example.com"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate = %v", err)
	}
	if len(store.Audits()) != 2 {
		t.Fatalf("audits=%d", len(store.Audits()))
	}
}
func TestEnquiryPipelineOwnersFiltersAndViews(t *testing.T) {
	service, _, actor := fixture(t)
	ctx := context.Background()
	contact, err := service.CreateContact(ctx, actor, ContactInput{Name: "Ama Mensah", Email: "ama@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	sourceID := "00000000-0000-4000-8000-000000000099"
	enquiry, err := service.CreateEnquiry(ctx, actor, EnquiryInput{SourceEnquiryID: sourceID, ContactID: contact.PublicID, Summary: "Accra show"})
	if err != nil {
		t.Fatal(err)
	}
	if enquiry.Reference != "JK-AUTHORITATIVE" || enquiry.Source != "referral" || enquiry.EnquiryType != "event" || enquiry.ServiceID != "00000000-0000-4000-8000-000000000077" {
		t.Fatalf("source attribution not authoritative: %#v", enquiry)
	}
	owner := "00000000-0000-4000-8000-000000000088"
	if enquiry, err = service.Assign(ctx, actor, enquiry.PublicID, owner); err != nil || enquiry.OwnerID != owner {
		t.Fatalf("assign: %#v %v", enquiry, err)
	}
	for _, stage := range []Stage{StageReviewing, StageQualified, StageCallScheduled, StageProposalSent, StageNegotiation, StageWon, StageArchived} {
		if enquiry, err = service.SetStage(ctx, actor, enquiry.PublicID, stage); err != nil {
			t.Fatalf("stage %s: %v", stage, err)
		}
	}
	if _, err = service.SetStage(ctx, actor, enquiry.PublicID, StageNew); !errors.Is(err, ErrConflict) {
		t.Fatalf("backward stage=%v", err)
	}
	filter := EnquiryFilter{Stages: []Stage{StageArchived}, OwnerID: owner, Sources: []string{"referral"}, Query: "accra"}
	items, err := service.ListEnquiries(ctx, actor, filter)
	if err != nil || len(items) != 1 {
		t.Fatalf("filter=%d %v", len(items), err)
	}
	if _, err = service.SaveView(ctx, actor, "My pipeline", filter); err != nil {
		t.Fatal(err)
	}
	views, err := service.ListViews(ctx, actor)
	if err != nil || len(views) != 1 || views[0].OwnerID != actor.InternalID {
		t.Fatalf("views=%#v %v", views, err)
	}
}
func TestRBACSoftDeleteAndPrivacy(t *testing.T) {
	service, store, admin := fixture(t)
	ctx := context.Background()
	reader := Actor{InternalID: "reader", Permissions: map[Permission]bool{PermissionRead: true}}
	if _, err := service.CreateContact(ctx, reader, ContactInput{Name: "Ama", Email: "a@example.com"}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("write=%v", err)
	}
	org, err := service.CreateOrganization(ctx, admin, OrganizationInput{Name: "Private Org"})
	if err != nil {
		t.Fatal(err)
	}
	contact, err := service.CreateContact(ctx, admin, ContactInput{OrganizationID: org.PublicID, Name: "Ama", Email: "a@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	enquiry, err := service.CreateEnquiry(ctx, admin, EnquiryInput{SourceEnquiryID: "00000000-0000-4000-8000-000000000099", ContactID: contact.PublicID, OrganizationID: org.PublicID, Summary: "private brief"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.PrivacyExport(ctx, reader, contact.PublicID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("export=%v", err)
	}
	export, err := service.PrivacyExport(ctx, admin, contact.PublicID)
	if err != nil || len(export.Enquiries) != 1 || export.Organization == nil {
		t.Fatalf("export=%#v %v", export, err)
	}
	result, err := service.PrivacyDelete(ctx, admin, contact.PublicID)
	if err != nil || result.Contacts != 1 || result.Organizations != 1 || result.Enquiries != 1 {
		t.Fatalf("delete=%#v %v", result, err)
	}
	source, ok := store.Source("00000000-0000-4000-8000-000000000099")
	if !ok || source.Reference != "JK-AUTHORITATIVE" || source.Contact.Name != "Deleted contact" || source.Contact.Email != "deleted@example.invalid" || source.Contact.Phone != "" || source.Contact.Organization != "" {
		t.Fatalf("source privacy deletion = %#v", source)
	}
	if _, err = service.LookupContact(ctx, admin, "a@example.com", ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("lookup after delete=%v", err)
	}
	items, err := service.ListEnquiries(ctx, admin, EnquiryFilter{IncludeDeleted: true})
	if err != nil || len(items) != 1 || items[0].PublicID != enquiry.PublicID || items[0].Summary != "" || items[0].ContactID != "" {
		t.Fatalf("redaction=%#v %v", items, err)
	}
	if len(store.Audits()) != 5 {
		t.Fatalf("audits=%d", len(store.Audits()))
	}
}

func TestCallerCannotForgeAttributionAndSourceMustExist(t *testing.T) {
	service, _, actor := fixture(t)
	ctx := context.Background()
	contact, _ := service.CreateContact(ctx, actor, ContactInput{Name: "Ama", Email: "a@example.com"})
	input := EnquiryInput{SourceEnquiryID: "00000000-0000-4000-8000-000000000099", ContactID: contact.PublicID}
	item, err := service.CreateEnquiry(ctx, actor, input)
	if err != nil {
		t.Fatal(err)
	}
	if item.Reference != "JK-AUTHORITATIVE" || item.ServiceID != "00000000-0000-4000-8000-000000000077" || item.Source != "referral" || item.EnquiryType != "event" {
		t.Fatalf("source attribution not copied: %#v", item)
	}
	handler := NewHandler(service, func(*http.Request) (Actor, error) { return actor, nil })
	body := `{"source_enquiry_id":"00000000-0000-4000-8000-000000000099","contact_id":"` + contact.PublicID + `","reference":"FORGED","source":"press"}`
	request := httptest.NewRequest(http.MethodPost, "/api/admin/crm/enquiries", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("forged HTTP attribution status=%d body=%s", response.Code, response.Body.String())
	}
	input.SourceEnquiryID = "00000000-0000-4000-8000-000000000055"
	if _, err = service.CreateEnquiry(ctx, actor, input); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing source = %v", err)
	}
}

func TestExactStageGraphRejectsSkipsAndBackwardMoves(t *testing.T) {
	service, _, actor := fixture(t)
	ctx := context.Background()
	contact, _ := service.CreateContact(ctx, actor, ContactInput{Name: "Ama", Email: "a@example.com"})
	item, _ := service.CreateEnquiry(ctx, actor, EnquiryInput{SourceEnquiryID: "00000000-0000-4000-8000-000000000099", ContactID: contact.PublicID})
	if _, err := service.SetStage(ctx, actor, item.PublicID, StageQualified); !errors.Is(err, ErrConflict) {
		t.Fatalf("skip = %v", err)
	}
	for _, stage := range []Stage{StageReviewing, StageQualified, StageCallScheduled, StageProposalSent, StageNegotiation, StageLost, StageArchived} {
		if _, err := service.SetStage(ctx, actor, item.PublicID, stage); err != nil {
			t.Fatalf("%s = %v", stage, err)
		}
	}
	if _, err := service.SetStage(ctx, actor, item.PublicID, StageWon); !errors.Is(err, ErrConflict) {
		t.Fatalf("archived transition = %v", err)
	}
}
func TestAuditFailureRollsBackMutation(t *testing.T) {
	service, store, actor := fixture(t)
	ctx := context.Background()
	contact, err := service.CreateContact(ctx, actor, ContactInput{Name: "Ama", Email: "a@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	enquiry, err := service.CreateEnquiry(ctx, actor, EnquiryInput{SourceEnquiryID: "00000000-0000-4000-8000-000000000099", ContactID: contact.PublicID})
	if err != nil {
		t.Fatal(err)
	}
	store.FailAudit = true
	if _, err = service.SetStage(ctx, actor, enquiry.PublicID, StageReviewing); !errors.Is(err, ErrConflict) {
		t.Fatalf("stage=%v", err)
	}
	store.FailAudit = false
	items, _ := service.ListEnquiries(ctx, actor, EnquiryFilter{})
	if items[0].Stage != StageNew {
		t.Fatalf("mutation escaped rollback: %s", items[0].Stage)
	}
}

func TestSoftDeleteHonorsReferences(t *testing.T) {
	service, _, actor := fixture(t)
	ctx := context.Background()
	org, _ := service.CreateOrganization(ctx, actor, OrganizationInput{Name: "Referenced Org"})
	contact, _ := service.CreateContact(ctx, actor, ContactInput{OrganizationID: org.PublicID, Name: "Ama", Email: "a@example.com"})
	if err := service.SoftDeleteOrganization(ctx, actor, org.PublicID); !errors.Is(err, ErrConflict) {
		t.Fatalf("organization delete = %v", err)
	}
	if err := service.SoftDeleteContact(ctx, actor, contact.PublicID); err != nil {
		t.Fatalf("contact delete = %v", err)
	}
	if err := service.SoftDeleteOrganization(ctx, actor, org.PublicID); err != nil {
		t.Fatalf("organization delete after contact = %v", err)
	}
}
