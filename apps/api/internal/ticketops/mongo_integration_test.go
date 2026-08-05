package ticketops

import (
	"context"
	"os"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestCancelEventQueuesLegacyObjectIDLinkedPaidOrder(t *testing.T) {
	uri := os.Getenv("MONGODB_INTEGRATION_URI")
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI not configured")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	db := client.Database("jk024_cancel_" + bson.NewObjectID().Hex())
	t.Cleanup(func() { _ = db.Drop(context.Background()) })
	for _, name := range []string{"events", "ticket_orders", "ticket_communications", "audit_logs"} {
		if err = db.CreateCollection(t.Context(), name); err != nil {
			t.Fatal(err)
		}
	}
	eventObjectID := bson.NewObjectID()
	eventPublicID := "00000000-0000-4000-8000-000000000024"
	orderObjectID := bson.NewObjectID()
	if _, err = db.Collection("events").InsertOne(t.Context(), bson.M{"_id": eventObjectID, "public_id": eventPublicID, "status": "published"}); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Collection("ticket_orders").InsertOne(t.Context(), bson.M{"_id": orderObjectID, "public_id": "00000000-0000-4000-8000-000000000025", "reference": "JKT-2026-ABC12345", "event_id": eventObjectID, "status": "paid"}); err != nil {
		t.Fatal(err)
	}
	store := NewMongoStore(db, UUID)
	queued, err := store.CancelEvent(t.Context(), eventPublicID, "Venue unavailable", bson.NewObjectID().Hex(), time.Date(2026, 8, 5, 18, 0, 0, 0, time.UTC))
	if err != nil || queued != 1 {
		t.Fatalf("queued=%d err=%v", queued, err)
	}
	count, err := db.Collection("ticket_communications").CountDocuments(t.Context(), bson.M{"order_id": orderObjectID, "kind": "event.cancelled_refund_guidance", "status": "pending"})
	if err != nil || count != 1 {
		t.Fatalf("communications=%d err=%v", count, err)
	}
}
