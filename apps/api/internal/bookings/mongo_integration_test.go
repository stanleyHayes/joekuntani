package bookings

import (
	"context"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/changes"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestMongoConcurrentOverlapTimezoneLifecycleAndAuditRollback(t *testing.T) {
	uri := os.Getenv("MONGODB_INTEGRATION_URI")
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI not configured")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	db := client.Database("jk012_" + bson.NewObjectID().Hex())
	t.Cleanup(func() { _ = db.Drop(context.Background()) })
	if err = changes.ApplyAll(t.Context(), db, changes.Registry()); err != nil {
		t.Fatal(err)
	}
	bypass := options.InsertOne().SetBypassDocumentValidation(true)
	enquiryID, serviceID := "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201", "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c202"
	_, _ = db.Collection("crm_enquiries").InsertOne(t.Context(), bson.M{"public_id": enquiryID}, bypass)
	_, _ = db.Collection("services").InsertOne(t.Context(), bson.M{"public_id": serviceID, "active": true}, bypass)
	_, _ = db.Collection("site_settings").InsertOne(t.Context(), bson.M{"key": "global", "published": bson.M{"team": bson.M{"business_timezone": "Africa/Accra"}}}, bypass)
	service := NewService(NewMongoStore(db), nil)
	actor := Actor{InternalID: bson.NewObjectID().Hex(), Permissions: map[Permission]bool{Read: true, Write: true}}
	start := time.Date(2026, 8, 20, 18, 0, 0, 0, time.UTC)
	input := Input{EnquiryID: enquiryID, Title: "Accra appearance", ServiceID: serviceID, StartAt: start, EndAt: start.Add(2 * time.Hour), Venue: "National Theatre", City: "Accra", Country: "GH", Status: Confirmed, Fee: "1000.00", Currency: "GHS", Requirements: map[string]string{"sound": "two microphones"}}
	var wg sync.WaitGroup
	var warned atomic.Int32
	results := make(chan Booking, 8)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, e := service.Create(t.Context(), actor, input)
			if e != nil {
				t.Errorf("create: %v", e)
				return
			}
			if len(result.Warnings) > 0 {
				warned.Add(1)
			}
			results <- result.Booking
		}()
	}
	wg.Wait()
	close(results)
	if warned.Load() == 0 {
		t.Fatal("concurrent confirmed overlaps produced no warnings")
	}
	first := <-results
	cal, err := service.List(t.Context(), actor, Filter{From: start.Add(-time.Hour), To: start.Add(24 * time.Hour)})
	if err != nil || cal.Timezone != "Africa/Accra" || len(cal.Items) != 8 {
		t.Fatalf("calendar=%#v err=%v", cal, err)
	}
	ics, err := service.ICal(t.Context(), actor, Filter{From: start.Add(-time.Hour), To: start.Add(24 * time.Hour)})
	if err != nil || !strings.Contains(ics, "X-WR-TIMEZONE:Africa/Accra") || strings.Count(ics, "BEGIN:VEVENT") != 8 {
		t.Fatalf("ical=%q err=%v", ics, err)
	}
	update := input
	update.Version = first.Version
	update.Status = Cancelled
	cancelled, err := service.Update(t.Context(), actor, first.ID, update)
	if err != nil || cancelled.Booking.Status != Cancelled {
		t.Fatalf("cancel=%#v %v", cancelled, err)
	}
	update.Version = cancelled.Booking.Version
	update.Status = Confirmed
	if _, err = service.Update(t.Context(), actor, first.ID, update); err != ErrConflict {
		t.Fatalf("cancelled transition=%v", err)
	}
	reject := bson.D{{Key: "collMod", Value: "audit_logs"}, {Key: "validator", Value: bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": bson.A{"impossible"}}}}}
	if err = db.RunCommand(t.Context(), reject).Err(); err != nil {
		t.Fatal(err)
	}
	before, _ := db.Collection("bookings").CountDocuments(t.Context(), bson.M{})
	if _, err = service.Create(t.Context(), actor, input); err == nil {
		t.Fatal("booking survived rejected audit")
	}
	after, _ := db.Collection("bookings").CountDocuments(t.Context(), bson.M{})
	if before != after {
		t.Fatalf("audit rollback count %d -> %d", before, after)
	}
}
