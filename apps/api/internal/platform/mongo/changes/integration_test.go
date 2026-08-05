package changes

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/seed"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestIntegrationApplyReapplyAndRejectDrift(t *testing.T) {
	uri := integrationURI(t)
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })

	t.Run("validator drift", func(t *testing.T) {
		database := integrationDatabase(t, client, "validator")
		if err := ApplyAll(t.Context(), database, Registry()); err != nil {
			t.Fatalf("first ApplyAll() error = %v", err)
		}
		if err := ApplyAll(t.Context(), database, Registry()); err != nil {
			t.Fatalf("idempotent ApplyAll() error = %v", err)
		}
		drift := bson.D{{Key: "collMod", Value: "pages"}, {Key: "validator", Value: bson.M{"$jsonSchema": bson.M{"bsonType": "object"}}}}
		if err := database.RunCommand(t.Context(), drift).Err(); err != nil {
			t.Fatal(err)
		}
		if err := ApplyAll(t.Context(), database, Registry()); err == nil || !strings.Contains(err.Error(), "validator differs") {
			t.Fatalf("ApplyAll() after validator drift error = %v, want validator drift rejection", err)
		}
	})

	t.Run("index drift", func(t *testing.T) {
		database := integrationDatabase(t, client, "index")
		if err := ApplyAll(t.Context(), database, Registry()); err != nil {
			t.Fatalf("first ApplyAll() error = %v", err)
		}
		indexes := database.Collection("notification_outbox").Indexes()
		if err := indexes.DropOne(t.Context(), "ix_outbox_due"); err != nil {
			t.Fatal(err)
		}
		_, err := indexes.CreateOne(t.Context(), mongo.IndexModel{
			Keys: bson.D{{Key: "status", Value: 1}}, Options: options.Index().SetName("ix_outbox_due"),
		})
		if err != nil {
			t.Fatal(err)
		}
		if err := ApplyAll(t.Context(), database, Registry()); err == nil || !strings.Contains(err.Error(), "options differ") {
			t.Fatalf("ApplyAll() after index drift error = %v, want index drift rejection", err)
		}
	})
}

func TestIntegrationIdentifierAndSoftDeleteValidators(t *testing.T) {
	uri := integrationURI(t)
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	database := integrationDatabase(t, client, "constraints")
	if err := ApplyAll(t.Context(), database, Registry()); err != nil {
		t.Fatal(err)
	}

	testimonials := database.Collection("testimonials")
	base := bson.M{
		"public_id": "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c111", "title": "Placeholder testimonial", "summary": "", "body": "Placeholder - test only",
		"person_name": "Test Person", "person_title": "", "organization": "", "tags": bson.A{}, "featured": false, "gallery_asset_ids": bson.A{},
		"seo": bson.M{"title": "", "description": "", "canonical_url": "", "social_image_asset_id": ""}, "status": "draft", "approved": false,
		"revision": int64(1), "publish_at": nil, "unpublish_at": nil, "published_at": nil, "created_at": time.Now().UTC(), "updated_at": time.Now().UTC(),
	}
	invalidPublicID := cloneDocument(base)
	invalidPublicID["public_id"] = "not-a-uuid"
	if _, err := testimonials.InsertOne(t.Context(), invalidPublicID); err == nil {
		t.Fatal("invalid public UUID was accepted")
	}
	invalidInternalID := cloneDocument(base)
	invalidInternalID["_id"] = "not-an-object-id"
	if _, err := testimonials.InsertOne(t.Context(), invalidInternalID); err == nil {
		t.Fatal("non-ObjectId internal ID was accepted")
	}
	if _, err := testimonials.InsertOne(t.Context(), base); err != nil {
		t.Fatalf("valid identifier document rejected: %v", err)
	}

	contacts := database.Collection("contacts")
	contact := func(publicID string) bson.M {
		return bson.M{
			"public_id": publicID, "organization_id": "", "name": "Test Contact",
			"email": "test-contact@example.invalid", "phone": "", "role": "", "country_code": "",
			"normalized_email": "test-contact@example.invalid", "normalized_phone": "", "deleted_at": nil,
			"created_at": time.Now().UTC(), "updated_at": time.Now().UTC(),
		}
	}
	first, err := contacts.InsertOne(t.Context(), contact("018f47f6-9f5d-7d3a-8d4e-45f0f7d4c112"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := contacts.InsertOne(t.Context(), contact("018f47f6-9f5d-7d3a-8d4e-45f0f7d4c113")); !mongo.IsDuplicateKeyError(err) {
		t.Fatalf("duplicate active contact error = %v, want duplicate key", err)
	}
	if _, err := contacts.UpdateByID(t.Context(), first.InsertedID, bson.M{"$set": bson.M{"deleted_at": time.Now().UTC()}}); err != nil {
		t.Fatal(err)
	}
	if _, err := contacts.InsertOne(t.Context(), contact("018f47f6-9f5d-7d3a-8d4e-45f0f7d4c114")); err != nil {
		t.Fatalf("soft-deleted contact blocked reuse: %v", err)
	}
}

func TestIntegrationSeedClaimIsAtomicAndChecksummed(t *testing.T) {
	uri := integrationURI(t)
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	database := integrationDatabase(t, client, "seed")
	if err := ApplyAll(t.Context(), database, Registry()); err != nil {
		t.Fatal(err)
	}

	item := seed.Seed{
		Name: "integration_placeholder", Checksum: "sha256:test-v1",
		Apply: func(ctx context.Context, database *mongo.Database) error {
			_, err := database.Collection("seed_effects").UpdateOne(ctx, bson.M{"_id": "effect"}, bson.M{"$inc": bson.M{"count": 1}}, options.UpdateOne().SetUpsert(true))
			return err
		},
	}
	start := make(chan struct{})
	errorsChannel := make(chan error, 2)
	var waitGroup sync.WaitGroup
	for range 2 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			<-start
			errorsChannel <- seed.Run(t.Context(), database, "test", []seed.Seed{item})
		}()
	}
	close(start)
	waitGroup.Wait()
	close(errorsChannel)
	var successes int
	for err := range errorsChannel {
		if err == nil {
			successes++
		}
	}
	if successes == 0 {
		t.Fatal("no concurrent seed runner completed successfully")
	}
	var effect struct {
		Count int `bson:"count"`
	}
	if err := database.Collection("seed_effects").FindOne(t.Context(), bson.M{"_id": "effect"}).Decode(&effect); err != nil {
		t.Fatal(err)
	}
	if effect.Count != 1 {
		t.Fatalf("seed side effect count = %d, want 1", effect.Count)
	}
	if err := seed.Run(t.Context(), database, "test", []seed.Seed{item}); err != nil {
		t.Fatalf("idempotent seed rerun error = %v", err)
	}
	drifted := item
	drifted.Checksum = "sha256:test-v2"
	if err := seed.Run(t.Context(), database, "test", []seed.Seed{drifted}); err == nil || !strings.Contains(err.Error(), "checksum differs") {
		t.Fatalf("seed checksum drift error = %v, want rejection", err)
	}
}

func integrationURI(t *testing.T) string {
	t.Helper()
	uri := os.Getenv("MONGODB_INTEGRATION_URI")
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI is not configured")
	}
	return uri
}

func integrationDatabase(t *testing.T, client *mongo.Client, suffix string) *mongo.Database {
	t.Helper()
	database := client.Database("joe_kuntani_test_jk002_" + suffix)
	if err := database.Drop(t.Context()); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := database.Drop(context.Background()); err != nil && !errors.Is(err, context.Canceled) {
			t.Logf("drop integration database: %v", err)
		}
	})
	return database
}

func cloneDocument(source bson.M) bson.M {
	clone := make(bson.M, len(source))
	for key, value := range source {
		clone[key] = value
	}
	return clone
}
