package changes

import (
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestCampaignSchemasAreClosedAndUseDecimal128(t *testing.T) {
	collections := exactCampaignCollections()
	if len(collections) != 2 {
		t.Fatalf("collection count=%d", len(collections))
	}
	for _, collection := range collections {
		specification := collection.Validator["$jsonSchema"].(bson.M)
		if specification["additionalProperties"] != false {
			t.Fatalf("%s is not closed", collection.Name)
		}
		if len(collection.Indexes) < 2 || collection.Indexes[0].Name != "uq_public_id" || !collection.Indexes[0].Unique {
			t.Fatalf("%s lacks stable public identity", collection.Name)
		}
	}
	properties := collections[0].Validator["$jsonSchema"].(bson.M)["properties"].(bson.M)
	for _, field := range []string{"fee", "expenses"} {
		if properties[field].(bson.M)["bsonType"] != "decimal" {
			t.Fatalf("campaigns.%s is not Decimal128", field)
		}
	}
	if properties["currency"].(bson.M)["enum"] == nil || properties["asset_ids"].(bson.M)["uniqueItems"] != true {
		t.Fatal("campaign currency or asset reference constraints are missing")
	}
}

func TestIntegrationLegacyDeliverablesMigrateOnceWithoutLoss(t *testing.T) {
	client, err := mongo.Connect(options.Client().ApplyURI(integrationURI(t)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(t.Context()) })
	database := integrationDatabase(t, client, "campaign_legacy")
	campaignObjectID := bson.NewObjectID()
	legacyObjectID := bson.NewObjectID()
	publicID := "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c210"
	campaignPublicID := "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c211"
	if _, err := database.Collection("campaigns").InsertOne(t.Context(), bson.M{"_id": campaignObjectID, "public_id": campaignPublicID}); err != nil {
		t.Fatal(err)
	}
	dueAt := time.Date(2026, 8, 10, 12, 0, 0, 0, time.UTC)
	legacy := bson.M{"_id": legacyObjectID, "public_id": publicID, "campaign_id": campaignObjectID, "title": "Original title", "platform": "Instagram", "format": "Reel", "due_at": dueAt, "status": "submitted", "published_url": "", "approval_status": "pending"}
	if _, err := database.Collection("deliverables").InsertOne(t.Context(), legacy); err != nil {
		t.Fatal(err)
	}
	if err := migrateLegacyCampaignDeliverables(t.Context(), database); err != nil {
		t.Fatal(err)
	}
	if err := migrateLegacyCampaignDeliverables(t.Context(), database); err != nil {
		t.Fatalf("idempotent reapply failed: %v", err)
	}
	var migrated bson.M
	if err := database.Collection("campaign_deliverables").FindOne(t.Context(), bson.M{"public_id": publicID}).Decode(&migrated); err != nil {
		t.Fatal(err)
	}
	if migrated["campaign_id"] != campaignPublicID || migrated["title"] != legacy["title"] || migrated["status"] != legacy["status"] {
		t.Fatalf("migrated deliverable lost data: %#v", migrated)
	}
	migratedDueAt, ok := migrated["due_at"].(bson.DateTime)
	if !ok || !migratedDueAt.Time().Equal(dueAt) {
		t.Fatalf("migrated due_at=%v, want %v", migrated["due_at"], dueAt)
	}
	count, err := database.Collection("campaign_deliverables").CountDocuments(t.Context(), bson.M{"public_id": publicID})
	if err != nil || count != 1 {
		t.Fatalf("migrated count=%d err=%v", count, err)
	}
	if err := schema.Apply(t.Context(), database, exactCampaignReviewCollections()); err != nil {
		t.Fatalf("apply reviewed campaign validators: %v", err)
	}
	invalidFee, _ := bson.ParseDecimal128("1E+1")
	zero, _ := bson.ParseDecimal128("0.00")
	invalidMoneyCampaign := bson.M{
		"public_id": "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c212", "enquiry_id": "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c213",
		"organization_id": "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c214", "title": "Invalid accounting scale", "objective": "Must fail",
		"platforms": bson.A{"web"}, "starts_on": dueAt, "ends_on": dueAt.Add(time.Hour), "status": "draft", "fee": invalidFee,
		"expenses": zero, "currency": "GHS", "results": bson.A{}, "asset_ids": bson.A{}, "created_at": dueAt, "updated_at": dueAt,
	}
	if _, err := database.Collection("campaigns").InsertOne(t.Context(), invalidMoneyCampaign); err == nil {
		t.Fatal("campaign validator accepted Decimal128 exponent notation")
	}
}

func TestCampaignReviewRequiresCanonicalTwoDecimalMoney(t *testing.T) {
	collections := exactCampaignReviewCollections()
	validator := collections[0].Validator["$and"].(bson.A)
	if len(validator) != 2 {
		t.Fatalf("review validator clauses=%d", len(validator))
	}
	expression := validator[1].(bson.M)["$expr"].(bson.M)["$and"].(bson.A)
	for _, clause := range expression {
		pattern := clause.(bson.M)["$regexMatch"].(bson.M)["regex"]
		if pattern != "^(0|[1-9][0-9]{0,14})\\.[0-9]{2}$" {
			t.Fatalf("money regex=%v", pattern)
		}
	}
}
