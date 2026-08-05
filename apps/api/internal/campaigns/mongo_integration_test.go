package campaigns

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/media"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestMongoStorePersistsDecimal128AndRollsBackWithoutAudit(t *testing.T) {
	uri := strings.TrimSpace(os.Getenv("MONGODB_INTEGRATION_URI"))
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI is not configured")
	}
	ctx := context.Background()
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	defer client.Disconnect(ctx)
	database := client.Database("jk_campaigns_" + strings.ReplaceAll(uuid(), "-", ""))
	defer database.Drop(ctx)

	for _, seed := range []struct {
		collection string
		document   bson.M
	}{
		{"crm_enquiries", bson.M{"public_id": enquiryID}},
		{"organizations", bson.M{"public_id": organizationID}},
		{"media_assets", bson.M{"public_id": assetID, "status": "ready"}},
		{"media_assets", bson.M{"public_id": "10000000-0000-4000-8000-000000000007", "status": "ready"}},
	} {
		if _, err = database.Collection(seed.collection).InsertOne(ctx, seed.document); err != nil {
			t.Fatal(err)
		}
	}
	store := NewMongoStore(database)
	service := NewService(store, store, nil)
	service.now = func() time.Time { return time.Date(2026, 8, 5, 12, 0, 0, 0, time.UTC) }
	service.id = func() string { return "10000000-0000-4000-8000-000000000004" }
	actor := Actor{ID: "64f000000000000000000001", Role: "administrator"}
	created, err := service.Create(ctx, actor, input())
	if err != nil {
		t.Fatal(err)
	}
	var raw bson.M
	if err = database.Collection("campaigns").FindOne(ctx, bson.M{"public_id": created.PublicID}).Decode(&raw); err != nil {
		t.Fatal(err)
	}
	if _, ok := raw["fee"].(bson.Decimal128); !ok {
		t.Fatalf("fee type=%T, want Decimal128", raw["fee"])
	}
	if count, _ := database.Collection("audit_logs").CountDocuments(ctx, bson.M{"entity_id": created.PublicID, "action": "campaign.created"}); count != 1 {
		t.Fatalf("audit count=%d", count)
	}
	if count, _ := database.Collection("media_usage_references").CountDocuments(ctx, bson.M{"asset_id": assetID, "entity_type": "campaign", "entity_id": created.PublicID}); count != 1 {
		t.Fatalf("campaign asset reference count=%d", count)
	}
	mediaStore, err := media.NewMongoRepository(database)
	if err != nil {
		t.Fatal(err)
	}
	if err = mediaStore.Delete(ctx, assetID, service.now(), media.AuditEvent{}); err != media.ErrReferenced {
		t.Fatalf("referenced asset delete=%v", err)
	}
	updated := input()
	updated.AssetIDs = []string{"10000000-0000-4000-8000-000000000007"}
	if _, err = service.Update(ctx, actor, created.PublicID, updated); err != nil {
		t.Fatal(err)
	}
	if count, _ := database.Collection("media_usage_references").CountDocuments(ctx, bson.M{"asset_id": assetID, "entity_type": "campaign", "entity_id": created.PublicID}); count != 0 {
		t.Fatalf("replaced campaign asset retained %d references", count)
	}
	service.id = func() string { return "10000000-0000-4000-8000-000000000006" }
	deliverable, err := service.AddDeliverable(ctx, actor, created.PublicID, DeliverableInput{Title: "Launch reel", Platform: "Instagram", Format: "video", DueAt: "2026-08-20T12:00:00Z", Status: DeliverablePending, Approval: ApprovalPending, AssetIDs: []string{"10000000-0000-4000-8000-000000000007"}})
	if err != nil {
		t.Fatal(err)
	}
	if count, _ := database.Collection("media_usage_references").CountDocuments(ctx, bson.M{"asset_id": "10000000-0000-4000-8000-000000000007", "entity_type": "campaign_deliverable", "entity_id": deliverable.PublicID}); count != 1 {
		t.Fatalf("deliverable asset reference count=%d", count)
	}

	service.id = func() string { return "10000000-0000-4000-8000-000000000005" }
	if _, err = service.Create(ctx, Actor{ID: "not-an-object-id", Role: "administrator"}, input()); err == nil {
		t.Fatal("create unexpectedly succeeded without an auditable actor")
	}
	if count, _ := database.Collection("campaigns").CountDocuments(ctx, bson.M{"public_id": "10000000-0000-4000-8000-000000000005"}); count != 0 {
		t.Fatalf("unaudited campaign was not rolled back: count=%d", count)
	}

	if err = service.Delete(ctx, actor, created.PublicID); err != nil {
		t.Fatal(err)
	}
	if _, _, err = service.Detail(ctx, actor, created.PublicID); err != ErrNotFound {
		t.Fatalf("deleted detail error=%v", err)
	}
	if count, _ := database.Collection("media_usage_references").CountDocuments(ctx, bson.M{}); count != 0 {
		t.Fatalf("soft-deleted campaign retained %d asset references", count)
	}
}
