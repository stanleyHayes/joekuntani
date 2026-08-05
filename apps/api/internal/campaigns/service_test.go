package campaigns

import (
	"context"
	"testing"
	"time"
)

const enquiryID = "10000000-0000-4000-8000-000000000001"
const organizationID = "10000000-0000-4000-8000-000000000002"
const assetID = "10000000-0000-4000-8000-000000000003"

type refs struct{}

func (refs) EnquiryExists(context.Context, string) bool      { return true }
func (refs) OrganizationExists(context.Context, string) bool { return true }
func (refs) MediaReady(_ context.Context, id string) bool    { return id == assetID }

type metrics struct{ events []string }

func (m *metrics) Record(_ context.Context, event string, _ map[string]string) {
	m.events = append(m.events, event)
}
func input() Input {
	return Input{EnquiryID: enquiryID, OrganizationID: organizationID, Title: "Approved campaign", Objective: "Approved objective", Platforms: []string{"Instagram"}, StartsOn: "2026-08-10", EndsOn: "2026-09-10", Status: StatusDraft, Fee: Money{Amount: "1000.00", Currency: "GHS"}, Expenses: Money{Amount: "100.00", Currency: "GHS"}, Results: []Result{{Label: "Reach", Value: "Approved value"}}, AssetIDs: []string{assetID}}
}
func service() (*Service, *MemoryStore) {
	store := NewMemoryStore()
	svc := NewService(store, refs{}, &metrics{})
	svc.now = func() time.Time { return time.Date(2026, 8, 5, 0, 0, 0, 0, time.UTC) }
	return svc, store
}
func TestCampaignLifecycleAndFinancialValidation(t *testing.T) {
	svc, _ := service()
	actor := Actor{ID: "admin", Role: "administrator"}
	item, err := svc.Create(context.Background(), actor, input())
	if err != nil {
		t.Fatal(err)
	}
	update := input()
	update.Status = StatusActive
	if _, err = svc.Update(context.Background(), actor, item.PublicID, update); err != nil {
		t.Fatal(err)
	}
	update.Status = StatusDraft
	if _, err = svc.Update(context.Background(), actor, item.PublicID, update); err != ErrConflict {
		t.Fatalf("backward transition=%v", err)
	}
	bad := input()
	bad.Expenses.Currency = "USD"
	if _, err = svc.Create(context.Background(), actor, bad); err != ErrInvalid {
		t.Fatalf("mixed currency=%v", err)
	}
	if _, err = svc.Create(context.Background(), Actor{ID: "editor", Role: "content_editor"}, input()); err != ErrForbidden {
		t.Fatalf("role=%v", err)
	}
}
func TestDeliverableApprovalAssetsAndPublishGate(t *testing.T) {
	svc, _ := service()
	actor := Actor{ID: "manager", Role: "booking_manager"}
	campaign, _ := svc.Create(context.Background(), actor, input())
	in := DeliverableInput{Title: "Approved cut", Platform: "Instagram", Format: "video", DueAt: "2026-08-20T12:00:00Z", Status: DeliverablePublished, Approval: ApprovalPending, PublishedURL: "https://example.test/post", AssetIDs: []string{assetID}}
	if _, err := svc.AddDeliverable(context.Background(), actor, campaign.PublicID, in); err != ErrInvalid {
		t.Fatalf("unapproved publish=%v", err)
	}
	in.Status, in.Approval, in.PublishedURL = DeliverablePending, ApprovalPending, ""
	item, err := svc.AddDeliverable(context.Background(), actor, campaign.PublicID, in)
	if err != nil {
		t.Fatal(err)
	}
	for _, step := range []struct {
		status   DeliverableStatus
		approval ApprovalStatus
		url      string
	}{{DeliverableInProgress, ApprovalPending, ""}, {DeliverableSubmitted, ApprovalApproved, ""}, {DeliverableApproved, ApprovalApproved, ""}, {DeliverablePublished, ApprovalApproved, "https://example.test/post"}} {
		in.Status, in.Approval, in.PublishedURL = step.status, step.approval, step.url
		item, err = svc.UpdateDeliverable(context.Background(), actor, campaign.PublicID, item.PublicID, in)
		if err != nil {
			t.Fatal(err)
		}
	}
	if item.Status != DeliverablePublished || item.Approval != ApprovalApproved {
		t.Fatal("published approval missing")
	}
}
func TestDeliverableLifecycleRejectsSkippedAndBackwardTransitions(t *testing.T) {
	svc, _ := service()
	actor := Actor{ID: "manager", Role: "booking_manager"}
	campaign, _ := svc.Create(context.Background(), actor, input())
	in := DeliverableInput{Title: "Approved cut", Platform: "Instagram", Format: "video", DueAt: "2026-08-20T12:00:00Z", Status: DeliverablePending, Approval: ApprovalPending, AssetIDs: []string{assetID}}
	item, err := svc.AddDeliverable(context.Background(), actor, campaign.PublicID, in)
	if err != nil {
		t.Fatal(err)
	}
	in.Status = DeliverableSubmitted
	if _, err = svc.UpdateDeliverable(context.Background(), actor, campaign.PublicID, item.PublicID, in); err != ErrConflict {
		t.Fatalf("skipped workflow transition=%v", err)
	}
	in.Status = DeliverableInProgress
	in.Approval = ApprovalApproved
	if _, err = svc.UpdateDeliverable(context.Background(), actor, campaign.PublicID, item.PublicID, in); err != nil {
		t.Fatal(err)
	}
	in.Status = DeliverablePending
	if _, err = svc.UpdateDeliverable(context.Background(), actor, campaign.PublicID, item.PublicID, in); err != ErrConflict {
		t.Fatalf("backward workflow transition=%v", err)
	}
	if err = svc.Delete(context.Background(), actor, campaign.PublicID); err != nil {
		t.Fatal(err)
	}
	in.Status = DeliverableSubmitted
	if _, err = svc.UpdateDeliverable(context.Background(), actor, campaign.PublicID, item.PublicID, in); err != ErrNotFound {
		t.Fatalf("deleted parent mutation=%v", err)
	}
}
func TestSoftDeleteAndFilters(t *testing.T) {
	svc, _ := service()
	actor := Actor{ID: "admin", Role: "administrator"}
	item, _ := svc.Create(context.Background(), actor, input())
	if err := svc.Delete(context.Background(), actor, item.PublicID); err != nil {
		t.Fatal(err)
	}
	visible, _ := svc.List(context.Background(), actor, Filter{})
	if len(visible) != 0 {
		t.Fatal("deleted visible")
	}
	all, _ := svc.List(context.Background(), actor, Filter{IncludeDeleted: true})
	if len(all) != 1 {
		t.Fatal("deleted missing")
	}
	if _, err := svc.List(context.Background(), Actor{ID: "editor", Role: "content_editor"}, Filter{}); err != ErrForbidden {
		t.Fatalf("editor=%v", err)
	}
}

func TestCreateRequiresInitialStatesAndCanonicalMoney(t *testing.T) {
	svc, _ := service()
	actor := Actor{ID: "admin", Role: "administrator"}
	for _, amount := range []string{"1", "1.0", "1.000", "1e2", "1000000000000000.00", "NaN"} {
		candidate := input()
		candidate.Fee.Amount = amount
		if _, err := svc.Create(context.Background(), actor, candidate); err != ErrInvalid {
			t.Fatalf("amount %q error=%v", amount, err)
		}
	}
	candidate := input()
	candidate.Status = StatusCompleted
	if _, err := svc.Create(context.Background(), actor, candidate); err != ErrInvalid {
		t.Fatalf("terminal create=%v", err)
	}
}
