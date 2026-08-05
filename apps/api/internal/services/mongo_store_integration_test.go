package services_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/changes"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/services"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestMongoServiceLifecycleOrderingAndAuditRollback(t *testing.T) {
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
	defer client.Disconnect(context.Background())
	database := client.Database("jk006_services_" + bson.NewObjectID().Hex())
	defer database.Drop(context.Background())
	if err := changes.ApplyAll(ctx, database, changes.Registry()); err != nil {
		t.Fatalf("apply services change: %v", err)
	}
	if err := changes.ApplyAll(ctx, database, changes.Registry()); err != nil {
		t.Fatalf("idempotent reapply services change: %v", err)
	}

	domain := services.NewDomain(services.NewMongoStore(database), nil, nil)
	actor := services.Actor{InternalID: bson.NewObjectID().Hex(), PublicID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", CanEdit: true}
	first, err := domain.Create(ctx, actor, integrationInput("Later service", 20))
	if err != nil {
		t.Fatal(err)
	}
	second, err := domain.Create(ctx, actor, integrationInput("Earlier service", 10))
	if err != nil {
		t.Fatal(err)
	}
	public, err := domain.Public(ctx)
	if err != nil || len(public) != 2 || public[0].PublicID != second.PublicID {
		t.Fatalf("public ordering = %#v, error %v", public, err)
	}
	if err := domain.Reorder(ctx, actor, []services.OrderItem{{ID: first.PublicID, Version: first.Version}, {ID: second.PublicID, Version: second.Version}}); err != nil {
		t.Fatal(err)
	}
	if err := domain.SetActive(ctx, actor, first.PublicID, false, first.Version+1); err != nil {
		t.Fatal(err)
	}
	public, err = domain.Public(ctx)
	if err != nil || len(public) != 1 || public[0].PublicID != second.PublicID {
		t.Fatalf("inactive lifecycle leaked: %#v, error %v", public, err)
	}
	updatedInput := integrationInput("Renamed service", 4)
	updated, err := domain.Update(ctx, actor, second.PublicID, second.Version+1, updatedInput)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Slug != second.Slug || updated.PublicID != second.PublicID {
		t.Fatalf("stable identifiers changed: %#v", updated)
	}
	audits, err := database.Collection("audit_logs").CountDocuments(ctx, bson.M{"entity_type": "service"})
	if err != nil || audits != 5 {
		t.Fatalf("service audit count = %d, error %v, want 5", audits, err)
	}

	invalidValidator := bson.D{{Key: "collMod", Value: "audit_logs"}, {Key: "validator", Value: bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": bson.A{"impossible"}}}}}
	if err := database.RunCommand(ctx, invalidValidator).Err(); err != nil {
		t.Fatal(err)
	}
	if _, err := domain.Retire(ctx, actor, second.PublicID, updated.Version); err == nil {
		t.Fatal("retirement committed without required audit")
	}
	current, err := services.NewMongoStore(database).FindByID(ctx, second.PublicID)
	if err != nil {
		t.Fatal(err)
	}
	if current.RetiredAt != nil || !current.Active || current.Version != updated.Version {
		t.Fatalf("audit failure committed retirement: %#v", current)
	}
}

func TestMongoServiceSchemaRejectsInvalidNestedFormAndDetectsDrift(t *testing.T) {
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
	database := client.Database("jk006_schema_" + bson.NewObjectID().Hex())
	defer database.Drop(ctx)
	if err := changes.ApplyAll(ctx, database, changes.Registry()); err != nil {
		t.Fatal(err)
	}
	invalid := bson.M{
		"public_id": "11111111-1111-4111-8111-111111111111", "name": "Invalid form", "slug": "invalid-form",
		"summary": "", "description": "", "category": "", "active": false, "sort_order": 0,
		"form_schema": bson.M{"version": 1, "questions": bson.A{bson.M{"key": "bad-key", "label": "Bad", "type": "script", "required": true}}},
		"cta":         bson.M{"label": "Enquire", "href": "https://example.invalid"}, "created_at": time.Now().UTC(), "updated_at": time.Now().UTC(),
	}
	if _, err := database.Collection("services").InsertOne(ctx, invalid); err == nil {
		t.Fatal("invalid nested form and external CTA passed MongoDB validator")
	}
	if err := database.RunCommand(ctx, bson.D{{Key: "collMod", Value: "services"}, {Key: "validator", Value: bson.M{"$jsonSchema": bson.M{"bsonType": "object"}}}}).Err(); err != nil {
		t.Fatal(err)
	}
	if err := changes.ApplyAll(ctx, database, changes.Registry()); err == nil || !strings.Contains(err.Error(), "validator differs") {
		t.Fatalf("services validator drift error = %v", err)
	}
}

func integrationInput(name string, order int) services.Input {
	return services.Input{
		Name: name, Summary: "Approved test summary", Description: "Approved test description", Category: "Approved test category",
		Active: true, SortOrder: order,
		FormSchema: services.FormSchema{Version: 1, Questions: []services.Question{
			{Key: "objective", Label: "What is the objective?", Type: services.QuestionTextarea, Required: true},
			{Key: "channels", Label: "Which channels?", Type: services.QuestionMultiSelect, Options: []string{"Channel one", "Channel two"}},
		}},
		CTA: services.CTA{Label: "Start an enquiry", Href: "/book"},
	}
}
