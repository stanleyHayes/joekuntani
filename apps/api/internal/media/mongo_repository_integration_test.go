package media

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestMongoRepositoryLifecycleIsAtomic(t *testing.T) {
	uri := strings.TrimSpace(os.Getenv("MONGODB_INTEGRATION_URI"))
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	defer client.Disconnect(ctx)
	database := client.Database("jk008_media_" + strings.ReplaceAll(t.Name(), "/", "_"))
	defer database.Drop(ctx)
	for _, name := range []string{"media_assets", "audit_logs", "media_usage_references", "media_callback_events"} {
		if err = database.CreateCollection(ctx, name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = database.Collection("media_usage_references").Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "asset_id", Value: 1}, {Key: "entity_type", Value: 1}, {Key: "entity_id", Value: 1}, {Key: "field", Value: 1}}, Options: options.Index().SetUnique(true)}); err != nil {
		t.Fatal(err)
	}
	if _, err = database.Collection("media_callback_events").Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "provider", Value: 1}, {Key: "event_hash", Value: 1}}, Options: options.Index().SetUnique(true)}); err != nil {
		t.Fatal(err)
	}
	repository, _ := NewMongoRepository(database)
	provider, sign := testProvider(t)
	service, err := NewService(repository, provider, testPolicy(), func() time.Time { return fixedTime })
	if err != nil {
		t.Fatal(err)
	}
	actorID := bson.NewObjectID().Hex()
	actor := Actor{ID: actorID, CanEditContent: true}
	asset, _, err := service.RequestUpload(ctx, actor, validUpload())
	if err != nil {
		t.Fatal(err)
	}
	if asset.Status != StatusUploading {
		t.Fatalf("status %s", asset.Status)
	}
	completion := Completion{AssetID: asset.PublicID, StorageKey: "staging/content/" + asset.PublicID, PublicURL: "https://res.cloudinary.com/test/image/upload/a.jpg", MIMEType: "image/jpeg", Bytes: 1024, Width: 1600, Height: 900}
	body, headers := sign(completion, "event-1")
	if _, err = service.CompleteUpload(ctx, body, headers); err != nil {
		t.Fatal(err)
	}
	if _, err = service.CompleteUpload(ctx, body, headers); !errors.Is(err, ErrReplay) {
		t.Fatalf("wanted atomic replay rejection, got %v", err)
	}
	ref := UsageReference{AssetID: asset.PublicID, EntityType: "page", EntityID: "page-id", Field: "hero"}
	if err = service.AddReference(ctx, actor, ref); err != nil {
		t.Fatal(err)
	}
	if err = service.Delete(ctx, actor, asset.PublicID); !errors.Is(err, ErrReferenced) {
		t.Fatalf("wanted referenced, got %v", err)
	}
	if err = service.RemoveReference(ctx, actor, ref); err != nil {
		t.Fatal(err)
	}
	repository.database.Collection("audit_logs").Drop(ctx)
	if err = database.CreateCollection(ctx, "audit_logs", options.CreateCollection().SetValidator(bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": bson.A{"intentionally_missing"}}})); err != nil {
		t.Fatal(err)
	}
	before, _ := repository.Get(ctx, asset.PublicID)
	_, err = service.UpdateMetadata(ctx, actor, asset.PublicID, "Joe standing under amber stage lighting", nil, nil)
	if err == nil {
		t.Fatal("expected audit failure")
	}
	after, _ := repository.Get(ctx, asset.PublicID)
	if before.AltText != after.AltText {
		t.Fatal("metadata committed when audit transaction failed")
	}
}

func TestMongoDeleteClaimCannotRaceAReference(t *testing.T) {
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
	database := client.Database("jk008_delete_race_" + bson.NewObjectID().Hex())
	defer database.Drop(ctx)
	for _, name := range []string{"media_assets", "audit_logs", "media_usage_references", "media_callback_events"} {
		if err = database.CreateCollection(ctx, name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = database.Collection("media_usage_references").Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "asset_id", Value: 1}, {Key: "entity_type", Value: 1}, {Key: "entity_id", Value: 1}, {Key: "field", Value: 1}}, Options: options.Index().SetUnique(true)}); err != nil {
		t.Fatal(err)
	}
	repository, _ := NewMongoRepository(database)
	provider, _ := testProvider(t)
	service, _ := NewService(repository, provider, testPolicy(), func() time.Time { return fixedTime })
	actor := Actor{ID: bson.NewObjectID().Hex(), CanEditContent: true}
	for iteration := 0; iteration < 10; iteration++ {
		asset, _, requestErr := service.RequestUpload(ctx, actor, validUpload())
		if requestErr != nil {
			t.Fatal(requestErr)
		}
		ref := UsageReference{AssetID: asset.PublicID, EntityType: "page", EntityID: bson.NewObjectID().Hex(), Field: "hero"}
		start := make(chan struct{})
		results := make(chan error, 2)
		go func() { <-start; results <- service.AddReference(ctx, actor, ref) }()
		go func() { <-start; results <- service.Delete(ctx, actor, asset.PublicID) }()
		close(start)
		first, second := <-results, <-results
		if first == nil && second == nil {
			t.Fatal("reference and deletion both committed")
		}
	}
}

func TestMongoCallbackCannotRaceProviderDestroyOrResurrectAsset(t *testing.T) {
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
	database := client.Database("jk008_callback_delete_race_" + bson.NewObjectID().Hex())
	defer database.Drop(ctx)
	for _, name := range []string{"media_assets", "audit_logs", "media_usage_references", "media_callback_events"} {
		if err = database.CreateCollection(ctx, name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = database.Collection("media_callback_events").Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "provider", Value: 1}, {Key: "event_hash", Value: 1}}, Options: options.Index().SetUnique(true)}); err != nil {
		t.Fatal(err)
	}
	repository, _ := NewMongoRepository(database)
	cloudinary, sign := testProvider(t)
	deleteStarted := make(chan struct{})
	releaseDelete := make(chan struct{})
	provider := &blockingDeleteProvider{Cloudinary: cloudinary, started: deleteStarted, release: releaseDelete}
	service, _ := NewService(repository, provider, testPolicy(), func() time.Time { return fixedTime })
	actor := Actor{ID: bson.NewObjectID().Hex(), CanEditContent: true}
	asset, _, err := service.RequestUpload(ctx, actor, validUpload())
	if err != nil {
		t.Fatal(err)
	}
	completion := Completion{AssetID: asset.PublicID, StorageKey: "staging/content/" + asset.PublicID, PublicURL: "https://res.cloudinary.com/test/image/upload/race.jpg", MIMEType: "image/jpeg", ProviderVersion: "1", Bytes: 1024, Width: 1600, Height: 900}
	body, headers := sign(completion, "mongo-callback-during-delete")
	deleteResult := make(chan error, 1)
	go func() { deleteResult <- service.Delete(ctx, actor, asset.PublicID) }()
	<-deleteStarted
	if _, err = service.CompleteUpload(ctx, body, headers); !errors.Is(err, ErrConflict) {
		t.Fatalf("callback during provider destroy should conflict, got %v", err)
	}
	callbackCount, err := database.Collection("media_callback_events").CountDocuments(ctx, bson.M{})
	if err != nil || callbackCount != 0 {
		t.Fatalf("rejected callback claim should roll back, count=%d err=%v", callbackCount, err)
	}
	close(releaseDelete)
	if err = <-deleteResult; err != nil {
		t.Fatal(err)
	}
	var deleted assetDocument
	if err = database.Collection("media_assets").FindOne(ctx, bson.M{"public_id": asset.PublicID}).Decode(&deleted); err != nil {
		t.Fatal(err)
	}
	if deleted.Status != StatusDeleted {
		t.Fatalf("late callback resurrected asset to %s", deleted.Status)
	}
}
