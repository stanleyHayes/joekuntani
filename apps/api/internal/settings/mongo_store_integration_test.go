package settings

import (
	"context"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/changes"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestMongoStoreUpdatePublishAuditTransaction(t *testing.T) {
	uri := os.Getenv("MONGODB_INTEGRATION_URI")
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI is not set")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	ensureReplicaSet(t, client, uri)
	db := client.Database("jk_settings_" + strings.ToLower(bson.NewObjectID().Hex()))
	t.Cleanup(func() { _ = db.Drop(context.Background()) })
	if err := changes.ApplyAll(t.Context(), db, changes.Registry()); err != nil {
		t.Fatal(err)
	}
	invalid := bson.M{"key": GlobalKey, "version": int64(1), "draft": bson.M{"arbitrary": true}, "published": nil, "content_complete": false, "updated_by": bson.NewObjectID(), "updated_at": time.Now().UTC(), "published_at": nil}
	if _, err := db.Collection(settingsCollection).InsertOne(t.Context(), invalid); err == nil {
		t.Fatal("nested-invalid settings document was accepted")
	}
	actorID := bson.NewObjectID()
	service := NewService(NewMongoStore(db), func() time.Time { return time.Unix(100, 0).UTC() })
	principal := auth.Principal{UserID: "018f47f6-9f5d-7d3a-8d4e-45f0f7d4c999", InternalUserID: actorID.Hex(), Role: auth.RoleAdministrator, MFAVerified: true}
	document, err := service.Update(t.Context(), principal, 0, validValues(), true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Update(t.Context(), principal, 0, validValues(), true); err == nil {
		t.Fatal("stale write accepted")
	}
	document, err = service.Publish(t.Context(), principal, document.Version)
	if err != nil {
		t.Fatal(err)
	}
	public, err := service.GetPublic(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if public.Brand.Name != "Joe Kuntani" {
		t.Fatalf("public brand = %q", public.Brand.Name)
	}
	count, err := db.Collection("audit_logs").CountDocuments(t.Context(), bson.M{"entity_type": settingsCollection})
	if err != nil || count != 2 {
		t.Fatalf("audit count = %d, err = %v", count, err)
	}
	rejectAudits := bson.D{{Key: "collMod", Value: "audit_logs"}, {Key: "validator", Value: bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": bson.A{"impossible_field"}}}}, {Key: "validationLevel", Value: "strict"}, {Key: "validationAction", Value: "error"}}
	if err := db.RunCommand(t.Context(), rejectAudits).Err(); err != nil {
		t.Fatal(err)
	}
	changed := validValues()
	changed.Brand.Tagline = "Must roll back"
	if _, err := service.Update(t.Context(), principal, document.Version, changed, true); err == nil {
		t.Fatal("settings update succeeded while transactional audit was rejected")
	}
	afterFailure, err := NewMongoStore(db).Get(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if afterFailure.Version != document.Version || afterFailure.Draft.Brand.Tagline == "Must roll back" {
		t.Fatalf("audit failure did not roll back settings write: %#v", afterFailure)
	}
}

func ensureReplicaSet(t *testing.T, client *mongo.Client, uri string) {
	t.Helper()
	status := client.Database("admin").RunCommand(t.Context(), bson.D{{Key: "replSetGetStatus", Value: 1}}).Err()
	if status != nil {
		parsed, err := url.Parse(uri)
		if err != nil || parsed.Host == "" {
			t.Fatalf("invalid integration URI: %q", uri)
		}
		config := bson.M{"_id": "rs0", "members": bson.A{bson.M{"_id": 0, "host": parsed.Host}}}
		err = client.Database("admin").RunCommand(t.Context(), bson.D{{Key: "replSetInitiate", Value: config}}).Err()
		if err != nil && !strings.Contains(err.Error(), "already initialized") {
			t.Fatalf("initialize replica set: %v", err)
		}
	}
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		var hello struct {
			Writable bool `bson:"isWritablePrimary"`
		}
		if err := client.Database("admin").RunCommand(t.Context(), bson.D{{Key: "hello", Value: 1}}).Decode(&hello); err == nil && hello.Writable {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("replica set did not elect a primary")
}
