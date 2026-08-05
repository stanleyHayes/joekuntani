package ticketing

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/changes"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestMongoConcurrentHoldsExpiryIdempotencyAndLatePayment(t *testing.T) {
	uri := os.Getenv("MONGODB_INTEGRATION_URI")
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI is not configured")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	db := client.Database("joe_kuntani_test_jk021")
	_ = db.Drop(t.Context())
	t.Cleanup(func() { _ = db.Drop(context.Background()) })
	if err = changes.ApplyAll(t.Context(), db, changes.Registry()); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	eventID := "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201"
	ticketID := "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c202"
	seedInventory(t, db, eventID, ticketID, 5, now)
	store := NewMongoStore(db)
	service, serviceErr := NewService(store, 10*time.Minute, nil)
	if serviceErr != nil {
		t.Fatal(serviceErr)
	}
	service.now = func() time.Time { return now }
	input := validInput()
	input.EventID = eventID
	input.Items[0].TicketTypeID = ticketID
	input.Items[0].Quantity = 1
	start := make(chan struct{})
	var success atomic.Int32
	refs := make(chan string, 20)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			candidate := input
			candidate.IdempotencyKey = fmt.Sprintf("inventory-concurrency-%04d", i)
			receipt, e := service.Create(t.Context(), candidate)
			if e == nil {
				success.Add(1)
				refs <- receipt.Reference
			} else if !errors.Is(e, ErrConflict) {
				t.Errorf("create %d: %v", i, e)
			}
		}(i)
	}
	close(start)
	wg.Wait()
	close(refs)
	if success.Load() != 5 {
		t.Fatalf("successful holds=%d want=5", success.Load())
	}
	var ticket struct {
		Reserved int `bson:"reserved"`
		Sold     int `bson:"sold"`
		Capacity int `bson:"capacity"`
	}
	if err = db.Collection("ticket_types").FindOne(t.Context(), bson.M{"public_id": ticketID}).Decode(&ticket); err != nil || ticket.Reserved != 5 || ticket.Sold+ticket.Reserved > ticket.Capacity {
		t.Fatalf("inventory=%+v err=%v", ticket, err)
	}
	firstRef := <-refs
	var first orderDocument
	if err = db.Collection("ticket_orders").FindOne(t.Context(), bson.M{"reference": firstRef}).Decode(&first); err != nil {
		t.Fatal(err)
	}
	var firstFull struct {
		IdempotencyHash string `bson:"idempotency_hash"`
		RequestHash     string `bson:"request_hash"`
	}
	if err = db.Collection("ticket_orders").FindOne(t.Context(), bson.M{"reference": firstRef}).Decode(&firstFull); err != nil {
		t.Fatal(err)
	}
	replay, e := store.Create(t.Context(), firstFull.IdempotencyHash, firstFull.RequestHash, input, now, 10*time.Minute, uuid)
	if e != nil || replay.Reference != firstRef || replay.Stored {
		t.Fatalf("replay=%+v err=%v", replay, e)
	}
	if _, e = store.Create(t.Context(), firstFull.IdempotencyHash, strings.Repeat("b", 64), input, now, 10*time.Minute, uuid); !errors.Is(e, ErrConflict) {
		t.Fatalf("mismatched idempotency replay err=%v", e)
	}
	expired, e := store.ExpireDue(t.Context(), now.Add(11*time.Minute), 100)
	if e != nil || expired != 5 {
		t.Fatalf("expired=%d err=%v", expired, e)
	}
	if err = db.Collection("ticket_types").FindOne(t.Context(), bson.M{"public_id": ticketID}).Decode(&ticket); err != nil || ticket.Reserved != 0 {
		t.Fatalf("released inventory=%+v err=%v", ticket, err)
	}
	result, e := store.ReconcileLatePayment(t.Context(), firstRef, now.Add(12*time.Minute), 10*time.Minute, true)
	if e != nil || result != LatePaymentRestored {
		t.Fatalf("late restore=%q err=%v", result, e)
	}
	if err = db.Collection("ticket_types").FindOne(t.Context(), bson.M{"public_id": ticketID}).Decode(&ticket); err != nil || ticket.Reserved != 1 {
		t.Fatalf("restored inventory=%+v err=%v", ticket, err)
	}

	raceKey := "same-key-different-payload-race"
	left, right := input, input
	left.IdempotencyKey, right.IdempotencyKey = raceKey, raceKey
	left.BuyerName, right.BuyerName = "First Buyer", "Second Buyer"
	raceStart := make(chan struct{})
	raceErrors := make(chan error, 2)
	for _, candidate := range []CreateInput{left, right} {
		candidate := candidate
		go func() { <-raceStart; _, createErr := service.Create(t.Context(), candidate); raceErrors <- createErr }()
	}
	close(raceStart)
	var raceSuccess, raceConflict int
	for range 2 {
		if createErr := <-raceErrors; createErr == nil {
			raceSuccess++
		} else if errors.Is(createErr, ErrConflict) {
			raceConflict++
		} else {
			t.Fatalf("different-payload race error=%v", createErr)
		}
	}
	if raceSuccess != 1 || raceConflict != 1 {
		t.Fatalf("different-payload race success=%d conflict=%d", raceSuccess, raceConflict)
	}
	digest := sha256.Sum256([]byte(raceKey))
	if count, countErr := db.Collection("ticket_orders").CountDocuments(t.Context(), bson.M{"idempotency_hash": fmt.Sprintf("%x", digest)}); countErr != nil || count != 1 {
		t.Fatalf("race order count=%d err=%v", count, countErr)
	}
	if err = db.Collection("ticket_types").FindOne(t.Context(), bson.M{"public_id": ticketID}).Decode(&ticket); err != nil || ticket.Reserved != 2 || ticket.Sold+ticket.Reserved > ticket.Capacity {
		t.Fatalf("race inventory=%+v err=%v", ticket, err)
	}
}
func seedInventory(t *testing.T, db *mongo.Database, eventID, ticketID string, capacity int, now time.Time) {
	t.Helper()
	price, _ := bson.ParseDecimal128("25.50")
	_, err := db.Collection("events").InsertOne(t.Context(), bson.M{"public_id": eventID, "slug": "integration-event", "title": "Integration Event", "summary": "", "description": "", "venue": bson.M{"name": "Venue", "address": "Address", "city": "Accra", "country_code": "GH"}, "policies": bson.M{"refunds": "Refund policy", "entry": "Entry policy", "age_limit": 0}, "starts_at": now.Add(24 * time.Hour), "ends_at": now.Add(26 * time.Hour), "timezone": "Africa/Accra", "capacity": capacity, "ticket_capacity_allocated": capacity, "banner_asset_id": "", "banner": bson.M{"featured": false}, "status": "published", "published_at": now, "created_at": now, "updated_at": now})
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Collection("ticket_types").InsertOne(t.Context(), bson.M{"public_id": ticketID, "event_id": eventID, "name": "General Admission", "description": "", "price": price, "currency": "GHS", "capacity": capacity, "sold": 0, "reserved": 0, "min_per_order": 1, "max_per_order": 2, "sales_start": now.Add(-time.Hour), "sales_end": now.Add(23 * time.Hour), "paused": false, "status": "on_sale", "sort_order": 0, "created_at": now, "updated_at": now})
	if err != nil {
		t.Fatal(err)
	}
}
