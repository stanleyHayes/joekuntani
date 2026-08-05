package issuance

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/changes"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type blockingSender struct {
	started chan struct{}
	release chan struct{}
}

func (s blockingSender) SendTickets(context.Context, Delivery) error {
	close(s.started)
	<-s.release
	return nil
}

type instantSender struct{ sent chan struct{} }

func (s instantSender) SendTickets(context.Context, Delivery) error {
	close(s.sent)
	return nil
}

func TestExpiredWorkerCannotCompleteReclaimedDelivery(t *testing.T) {
	uri := os.Getenv("MONGODB_INTEGRATION_URI")
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI not configured")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	db := client.Database("joe_kuntani_test_jk023_lease")
	_ = db.Drop(t.Context())
	t.Cleanup(func() { _ = db.Drop(context.Background()) })
	if err = changes.ApplyAll(t.Context(), db, changes.Registry()); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Millisecond)
	orderID := bson.NewObjectID()
	zero, _ := bson.ParseDecimal128("0.00")
	_, err = db.Collection("ticket_orders").InsertOne(t.Context(), bson.M{"_id": orderID, "public_id": "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c203", "reference": "JKT-2026-ABC12345", "event_id": "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", "buyer_name": "Buyer", "buyer_email": "buyer@example.test", "buyer_phone": "", "currency": "GHS", "subtotal": zero, "fees": zero, "total": zero, "status": "paid", "idempotency_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "request_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "hold_expires_at": now, "terms_version": "2026-08-05", "terms_accepted_at": now, "ticket_access_hash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "ticket_access_expires_at": now.Add(24 * time.Hour), "created_at": now, "updated_at": now})
	if err != nil {
		t.Fatal(err)
	}
	deliveryID := "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c204"
	_, err = db.Collection("ticket_delivery_outbox").InsertOne(t.Context(), bson.M{"public_id": deliveryID, "order_id": orderID, "order_reference": "JKT-2026-ABC12345", "kind": "ticket.purchase_confirmation", "status": "pending", "attempts": 0, "next_attempt_at": now, "created_at": now, "updated_at": now})
	if err != nil {
		t.Fatal(err)
	}
	issuer, _ := NewMongoIssuer(db, []byte("ticket-signing-key-0123456789abcdef"))
	firstSender := blockingSender{started: make(chan struct{}), release: make(chan struct{})}
	first, _ := NewDeliveryWorker(db, issuer, firstSender, "https://example.test")
	first.now = func() time.Time { return now }
	first.claimID = func() (string, error) { return "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c205", nil }
	firstDone := make(chan error, 1)
	go func() { firstDone <- first.RunOnce(t.Context(), 1) }()
	<-firstSender.started

	secondSender := instantSender{sent: make(chan struct{})}
	second, _ := NewDeliveryWorker(db, issuer, secondSender, "https://example.test")
	second.now = func() time.Time { return now.Add(3 * time.Minute) }
	second.claimID = func() (string, error) { return "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c206", nil }
	if err = second.RunOnce(t.Context(), 1); err != nil {
		t.Fatal(err)
	}
	<-secondSender.sent
	close(firstSender.release)
	if err = <-firstDone; err != nil {
		t.Fatal(err)
	}
	var row bson.M
	if err = db.Collection("ticket_delivery_outbox").FindOne(t.Context(), bson.M{"public_id": deliveryID}).Decode(&row); err != nil {
		t.Fatal(err)
	}
	wantSent := bson.NewDateTimeFromTime(now.Add(3 * time.Minute))
	if row["status"] != "sent" || row["updated_at"] != wantSent || row["sent_at"] != wantSent || row["claim_token"] != nil {
		t.Fatalf("stale worker overwrote reclaimed delivery: %#v", row)
	}
}
