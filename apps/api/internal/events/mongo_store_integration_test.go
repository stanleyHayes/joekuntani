package events

import (
	"context"
	"errors"
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

func TestMongoStorePersistsDecimal128AndPreventsConcurrentOverAllocation(t *testing.T) {
	uri := strings.TrimSpace(os.Getenv("MONGODB_INTEGRATION_URI"))
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	defer client.Disconnect(ctx)
	database := client.Database("jk019_events_" + bson.NewObjectID().Hex())
	defer database.Drop(ctx)
	if err = changes.ApplyAll(ctx, database, changes.Registry()); err != nil {
		t.Fatal(err)
	}
	store := NewMongoStore(database)
	ids := testIDs()
	service := NewService(store, func() time.Time { return testNow }, ids)
	actor := Actor{InternalID: bson.NewObjectID().Hex(), CanManage: true}
	input := validEventInput()
	input.Capacity = 60
	if _, err = service.Create(ctx, Actor{InternalID: "invalid-object-id", CanManage: true}, input); !errors.Is(err, ErrForbidden) {
		t.Fatalf("audit failure error = %v, want forbidden", err)
	}
	if count, countErr := database.Collection("events").CountDocuments(ctx, bson.M{}); countErr != nil || count != 0 {
		t.Fatalf("event committed despite audit rollback: count=%d error=%v", count, countErr)
	}
	event, err := service.Create(ctx, actor, input)
	if err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	var group sync.WaitGroup
	for index := 0; index < 2; index++ {
		group.Add(1)
		go func(order int) {
			defer group.Done()
			<-start
			ticket := validTicketInput()
			ticket.Name = []string{"General admission", "Premium admission"}[order]
			ticket.Price = []string{"150.00", "250.50"}[order]
			ticket.Capacity = 40
			ticket.SortOrder = order
			_, createErr := service.CreateTicket(ctx, actor, event.PublicID, ticket)
			results <- createErr
		}(index)
	}
	close(start)
	group.Wait()
	close(results)
	succeeded := 0
	for result := range results {
		if result == nil {
			succeeded++
		}
	}
	if succeeded != 1 {
		t.Fatalf("successful concurrent allocations = %d, want 1", succeeded)
	}
	var persisted bson.M
	if err = database.Collection("ticket_types").FindOne(ctx, bson.M{}).Decode(&persisted); err != nil {
		t.Fatal(err)
	}
	if _, ok := persisted["price"].(bson.Decimal128); !ok {
		t.Fatalf("price stored as %T, want Decimal128", persisted["price"])
	}
	var storedEvent bson.M
	if err = database.Collection("events").FindOne(ctx, bson.M{"public_id": event.PublicID}).Decode(&storedEvent); err != nil {
		t.Fatal(err)
	}
	if allocated, ok := storedEvent["ticket_capacity_allocated"].(int32); !ok || allocated != 40 {
		t.Fatalf("allocated capacity = %#v, want 40", storedEvent["ticket_capacity_allocated"])
	}
	banner, ok := storedEvent["banner"].(bson.D)
	featured := false
	for _, element := range banner {
		if element.Key == "featured" {
			featured, _ = element.Value.(bool)
		}
	}
	if !ok || !featured {
		t.Fatalf("featured banner was not persisted exactly: %#v", storedEvent["banner"])
	}
	published, err := service.Publish(ctx, actor, event.PublicID)
	if err != nil || published.Status != EventPublished || published.PublishedAt == nil {
		t.Fatalf("publish = %#v, %v", published, err)
	}
	cancelled, err := service.Cancel(ctx, actor, event.PublicID)
	if err != nil || cancelled.Status != EventCancelled || cancelled.CancelledAt == nil {
		t.Fatalf("cancel = %#v, %v", cancelled, err)
	}
	if audits, auditErr := database.Collection("audit_logs").CountDocuments(ctx, bson.M{"entity_type": bson.M{"$in": bson.A{"event", "ticket_type"}}}); auditErr != nil || audits != 4 {
		t.Fatalf("committed lifecycle audits = %d, want 4: %v", audits, auditErr)
	}
}
