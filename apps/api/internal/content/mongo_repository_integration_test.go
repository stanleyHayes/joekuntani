package content

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/changes"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestMongoContentLifecycleScheduleIdentifiersAndAuditRollback(t *testing.T) {
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
	database := client.Database("jk007_content_" + bson.NewObjectID().Hex())
	defer database.Drop(context.Background())
	if err := changes.ApplyAll(ctx, database, changes.Registry()); err != nil {
		t.Fatalf("apply content change: %v", err)
	}
	if err := changes.ApplyAll(ctx, database, changes.Registry()); err != nil {
		t.Fatalf("idempotent reapply content change: %v", err)
	}

	now := time.Date(2026, 8, 5, 15, 30, 0, 0, time.UTC)
	ids := []string{
		"123e4567-e89b-42d3-a456-426614174000",
		"223e4567-e89b-42d3-a456-426614174000",
		"323e4567-e89b-42d3-a456-426614174000",
		"423e4567-e89b-42d3-a456-426614174000",
		"523e4567-e89b-42d3-a456-426614174000",
		"623e4567-e89b-42d3-a456-426614174000",
	}
	identifier := 0
	domain := NewDomain(NewMongoRepository(database), func() time.Time { return now }, func() (string, error) {
		value := ids[identifier]
		identifier++
		return value, nil
	})
	actor := Actor{InternalID: bson.NewObjectID().Hex(), PublicID: "723e4567-e89b-42d3-a456-426614174000", CanEdit: true, CanApprove: true}
	created, err := domain.Create(ctx, actor, validPage())
	if err != nil {
		t.Fatal(err)
	}
	approved, err := domain.Approve(ctx, actor, created.PublicID, created.Revision, true)
	if err != nil || !approved.Approved {
		t.Fatalf("approve = %#v, %v", approved, err)
	}
	due := now.Add(time.Hour)
	scheduled, err := domain.Schedule(ctx, actor, created.PublicID, approved.Revision, due, nil)
	if err != nil {
		t.Fatal(err)
	}
	if public, err := domain.Public(ctx, Query{Kind: Page}); err != nil || len(public) != 0 {
		t.Fatalf("scheduled content leaked early: %#v, %v", public, err)
	}
	now = due.Add(time.Second)
	if public, err := domain.Public(ctx, Query{Kind: Page}); err != nil || len(public) != 1 || public[0].Slug != created.Slug {
		t.Fatalf("due content unavailable: %#v, %v", public, err)
	}

	updatedInput := validPage()
	updatedInput.Slug = "attempted-replacement"
	updatedInput.Title = "Updated title"
	updated, err := domain.Update(ctx, actor, created.PublicID, scheduled.Revision, updatedInput)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Slug != created.Slug || updated.Status != Draft || updated.Approved {
		t.Fatalf("update did not preserve slug/revoke publication: %#v", updated)
	}
	if _, err := database.Collection("pages").UpdateOne(ctx, bson.M{"public_id": created.PublicID}, bson.M{"$set": bson.M{"unknown_field": true}}); err == nil {
		t.Fatal("closed page validator accepted an unknown field")
	}

	audits, err := database.Collection("audit_logs").CountDocuments(ctx, bson.M{"entity_type": string(Page), "entity_id": created.PublicID})
	if err != nil || audits != 4 {
		t.Fatalf("content audit count = %d, error %v, want 4", audits, err)
	}
	invalidAuditValidator := bson.D{{Key: "collMod", Value: "audit_logs"}, {Key: "validator", Value: bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": bson.A{"impossible"}}}}}
	if err := database.RunCommand(ctx, invalidAuditValidator).Err(); err != nil {
		t.Fatal(err)
	}
	failedInput := validPage()
	failedInput.Title = "Must roll back"
	if _, err := domain.Update(ctx, actor, created.PublicID, updated.Revision, failedInput); err == nil {
		t.Fatal("content update committed without its audit")
	}
	current, err := NewMongoRepository(database).FindByID(ctx, created.PublicID)
	if err != nil {
		t.Fatal(err)
	}
	if current.Title != updated.Title {
		t.Fatalf("audit failure committed content: got %q want %q", current.Title, updated.Title)
	}
}

func TestMongoContentPersistsEveryKindAndKindSpecificFields(t *testing.T) {
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
	database := client.Database("jk007_kinds_" + bson.NewObjectID().Hex())
	defer database.Drop(context.Background())
	if err := changes.ApplyAll(ctx, database, changes.Registry()); err != nil {
		t.Fatal(err)
	}
	domain := NewDomain(NewMongoRepository(database), nil, nil)
	actor := Actor{InternalID: bson.NewObjectID().Hex(), PublicID: "723e4567-e89b-42d3-a456-426614174000", CanEdit: true, CanApprove: true}
	inputs := []Input{
		{Kind: Page, Slug: "about", Title: "Page", Body: "Page body"},
		{Kind: Portfolio, Slug: "campaign", Title: "Portfolio", Body: "Portfolio body", Category: "Campaign", Results: []Result{{Label: "Result", Value: "Pending approval"}}},
		{Kind: Video, Title: "Video", Body: "Video body", Category: "Interview", ExternalURL: "https://example.invalid/video", EmbedURL: "https://example.invalid/embed"},
		{Kind: Press, Title: "Press", Body: "Press body", Category: "News", ExternalURL: "https://example.invalid/press", Outlet: "Placeholder outlet"},
		{Kind: Testimonial, Title: "Testimonial", Body: "Pending approval", PersonName: "Placeholder person", PersonTitle: "Placeholder title", Organization: "Placeholder organization"},
	}
	for _, input := range inputs {
		created, createErr := domain.Create(ctx, actor, input)
		if createErr != nil {
			t.Fatalf("create %s: %v", input.Kind, createErr)
		}
		stored, findErr := NewMongoRepository(database).FindByID(ctx, created.PublicID)
		if findErr != nil || stored.Kind != input.Kind || stored.Revision != 1 || stored.Body != input.Body || stored.Category != input.Category || stored.ExternalURL != input.ExternalURL || stored.Outlet != input.Outlet || stored.PersonName != input.PersonName || len(stored.Results) != len(input.Results) {
			t.Fatalf("stored %s = %#v, %v", input.Kind, stored, findErr)
		}
	}
	if audits, countErr := database.Collection("audit_logs").CountDocuments(ctx, bson.M{"action": "content.create"}); countErr != nil || audits != 5 {
		t.Fatalf("create audits = %d, %v", audits, countErr)
	}
}
