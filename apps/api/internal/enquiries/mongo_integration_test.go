package enquiries

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/changes"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestMongoStoreConcurrentIdempotencyOutboxAndRollback(t *testing.T) {
	uri := os.Getenv("MONGODB_INTEGRATION_URI")
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI is not configured")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	db := client.Database("joe_kuntani_test_jk009_store")
	_ = db.Drop(t.Context())
	t.Cleanup(func() { _ = db.Drop(context.Background()) })
	if err = changes.ApplyAll(t.Context(), db, changes.Registry()); err != nil {
		t.Fatal(err)
	}
	store := NewMongoStore(db)
	now := time.Now().UTC()
	key := "integration-idempotency-key-0001"
	start := make(chan struct{})
	results := make(chan Receipt, 32)
	errs := make(chan error, 32)
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			id := fmt.Sprintf("018f47f6-9f5d-4d3a-8d4e-%012x", i+1)
			enquiry := validIntegrationEnquiry(id, fmt.Sprintf("JK-2026-%06d", i), now)
			receipt, e := store.Submit(t.Context(), key, strings.Repeat("a", 64), enquiry, validMessages(id, i, now))
			results <- receipt
			errs <- e
		}(i)
	}
	close(start)
	wg.Wait()
	close(results)
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatalf("concurrent submit: %v", e)
		}
	}
	var reference string
	for receipt := range results {
		if reference == "" {
			reference = receipt.Reference
		}
		if receipt.Reference != reference {
			t.Fatalf("idempotent references differ: %q / %q", reference, receipt.Reference)
		}
	}
	for collection, want := range map[string]int64{"enquiries": 1, "enquiry_idempotency": 1, "notification_outbox": 2} {
		got, e := db.Collection(collection).CountDocuments(t.Context(), bson.M{})
		if e != nil || got != want {
			t.Fatalf("%s count=%d err=%v want=%d", collection, got, e, want)
		}
	}
	mismatch := validIntegrationEnquiry("018f47f6-9f5d-4d3a-8d4e-45f0f7d4c997", "JK-2026-888888", now)
	if _, mismatchErr := store.Submit(t.Context(), key, strings.Repeat("d", 64), mismatch, validMessages(mismatch.PublicID, 97, now)); !errors.Is(mismatchErr, ErrInvalid) {
		t.Fatalf("same key with different request hash err=%v want ErrInvalid", mismatchErr)
	}
	for collection, want := range map[string]int64{"enquiries": 1, "enquiry_idempotency": 1, "notification_outbox": 2} {
		got, countErr := db.Collection(collection).CountDocuments(t.Context(), bson.M{})
		if countErr != nil || got != want {
			t.Fatalf("after mismatched replay %s count=%d err=%v want=%d", collection, got, countErr, want)
		}
	}

	claimed, claimErr := store.ClaimDue(t.Context(), now, 1)
	if claimErr != nil || len(claimed) != 1 {
		t.Fatalf("initial claim=%#v err=%v", claimed, claimErr)
	}
	tooEarly, claimErr := store.ClaimDue(t.Context(), now.Add(time.Minute), 1)
	if claimErr != nil || len(tooEarly) != 1 || tooEarly[0].PublicID == claimed[0].PublicID {
		t.Fatalf("lease should preserve first claim while claiming second: %#v err=%v", tooEarly, claimErr)
	}
	reclaimed, claimErr := store.ClaimDue(t.Context(), now.Add(3*time.Minute), 2)
	if claimErr != nil || len(reclaimed) != 2 {
		t.Fatalf("stale processing claims were not recovered: %#v err=%v", reclaimed, claimErr)
	}

	bad := validIntegrationEnquiry("018f47f6-9f5d-4d3a-8d4e-45f0f7d4c999", "JK-2026-999999", now)
	badMessages := validMessages(bad.PublicID, 99, now)
	badMessages[1].Kind = "invalid.kind"
	if _, err = store.Submit(t.Context(), "integration-idempotency-key-rollback", strings.Repeat("b", 64), bad, badMessages); err == nil {
		t.Fatal("invalid outbox transaction unexpectedly committed")
	}
	if got, _ := db.Collection("enquiries").CountDocuments(t.Context(), bson.M{"public_id": bad.PublicID}); got != 0 {
		t.Fatalf("rollback enquiry count=%d", got)
	}
	if got, _ := db.Collection("enquiry_idempotency").CountDocuments(t.Context(), bson.M{"enquiry_id": bad.PublicID}); got != 0 {
		t.Fatalf("rollback idempotency count=%d", got)
	}
	if got, _ := db.Collection("notification_outbox").CountDocuments(t.Context(), bson.M{"enquiry_id": bad.PublicID}); got != 0 {
		t.Fatalf("rollback outbox count=%d", got)
	}

	collision := validIntegrationEnquiry("018f47f6-9f5d-4d3a-8d4e-45f0f7d4c998", reference, now)
	_, err = store.Submit(t.Context(), "integration-idempotency-key-collision", strings.Repeat("c", 64), collision, validMessages(collision.PublicID, 98, now))
	if !errors.Is(err, ErrReferenceConflict) {
		t.Fatalf("reference collision err=%v", err)
	}
}

func validIntegrationEnquiry(id, reference string, now time.Time) Enquiry {
	return Enquiry{PublicID: id, Reference: reference, ServiceID: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c111", EnquiryType: "brand", Source: "search", Contact: Contact{Name: "Test Person", Email: "test@example.invalid", Role: "Director", Country: "GH"}, Details: Details{CampaignObjective: "Launch", TargetAudience: "Adults", Channels: []string{"Web"}, RequestedDeliverables: "Content", UsageRights: "Digital", Exclusivity: "None", LaunchDates: "2026"}, Answers: map[string]any{}, ProjectBrief: "A valid integration project brief.", Budget: "TBD", Currency: "GHS", DecisionDeadline: "2026-08-06", AdditionalNotes: "", MarketingConsent: false, Timeline: "TBD", ConsentText: ConsentTextCurrent, ConsentVersion: ConsentVersionCurrent, ConsentAt: now, CreatedAt: now, IPHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
}
func validMessages(enquiryID string, seed int, now time.Time) []OutboxMessage {
	return []OutboxMessage{{PublicID: fmt.Sprintf("018f47f6-9f5d-4d3a-8d4f-%012x", seed*2+1), EnquiryID: enquiryID, Kind: "enquiry.acknowledgement", NextAttemptAt: now}, {PublicID: fmt.Sprintf("018f47f6-9f5d-4d3a-8d4f-%012x", seed*2+2), EnquiryID: enquiryID, Kind: "enquiry.internal_alert", NextAttemptAt: now}}
}
