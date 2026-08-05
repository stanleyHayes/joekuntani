package changes

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestCRMWorkflowReviewMigratesLegacyRecordsWithoutLoss(t *testing.T) {
	uri := strings.TrimSpace(os.Getenv("MONGODB_INTEGRATION_URI"))
	if uri == "" {
		t.Skip("MONGODB_INTEGRATION_URI is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	defer client.Disconnect(ctx)
	db := client.Database("jk011_review_" + bson.NewObjectID().Hex())
	defer db.Drop(ctx)
	registry := Registry()
	if err := ApplyAll(ctx, db, registry[:24]); err != nil {
		t.Fatalf("apply predecessor registry: %v", err)
	}

	now := time.Date(2026, 8, 5, 18, 20, 0, 0, time.UTC)
	legacyEnquiryID := bson.NewObjectID()
	missingEnquiryID := bson.NewObjectID()
	staffID := bson.NewObjectID()
	sourceID := "00000000-0000-4000-8000-000000000101"
	crmID := "00000000-0000-4000-8000-000000000102"
	noteID := "00000000-0000-4000-8000-000000000103"
	taskID := "00000000-0000-4000-8000-000000000104"
	bypass := options.InsertOne().SetBypassDocumentValidation(true)
	for collection, document := range map[string]bson.M{
		"users":         {"_id": staffID, "public_id": "00000000-0000-4000-8000-000000000105"},
		"enquiries":     {"_id": legacyEnquiryID, "public_id": sourceID},
		"crm_enquiries": {"public_id": crmID, "source_enquiry_id": sourceID},
		"enquiry_notes": {"public_id": noteID, "enquiry_id": legacyEnquiryID, "author_id": staffID, "body": "Legacy private context", "created_at": now},
		"tasks":         {"public_id": taskID, "enquiry_id": missingEnquiryID, "assignee_id": staffID, "title": "Legacy follow-up", "priority": "high", "status": "completed", "due_at": now.Add(time.Hour), "created_at": now},
	} {
		if _, err := db.Collection(collection).InsertOne(ctx, document, bypass); err != nil {
			t.Fatalf("seed %s: %v", collection, err)
		}
	}

	if err := ApplyAll(ctx, db, registry); err == nil {
		t.Fatal("unresolved legacy enquiry unexpectedly migrated")
	}
	if count, _ := db.Collection("crm_enquiry_notes").CountDocuments(ctx, bson.M{"public_id": noteID}); count != 0 {
		t.Fatalf("failed migration did not roll back note: %d", count)
	}
	if _, err := db.Collection("enquiries").InsertOne(ctx, bson.M{"_id": missingEnquiryID, "public_id": "00000000-0000-4000-8000-000000000106"}, bypass); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Collection("crm_enquiries").InsertOne(ctx, bson.M{"public_id": "00000000-0000-4000-8000-000000000107", "source_enquiry_id": "00000000-0000-4000-8000-000000000106"}, bypass); err != nil {
		t.Fatal(err)
	}
	if err := ApplyAll(ctx, db, registry); err != nil {
		t.Fatalf("apply no-loss migration: %v", err)
	}
	if err := ApplyAll(ctx, db, registry); err != nil {
		t.Fatalf("idempotent reapply: %v", err)
	}

	var note bson.M
	if err := db.Collection("crm_enquiry_notes").FindOne(ctx, bson.M{"public_id": noteID}).Decode(&note); err != nil || note["enquiry_id"] != crmID || note["body"] != "Legacy private context" || note["author_id"] != staffID.Hex() {
		t.Fatalf("migrated note=%#v err=%v", note, err)
	}
	var task bson.M
	if err := db.Collection("crm_tasks").FindOne(ctx, bson.M{"public_id": taskID}).Decode(&task); err != nil || task["status"] != "done" || task["priority"] != "high" || task["assignee_id"] != staffID.Hex() {
		t.Fatalf("migrated task=%#v err=%v", task, err)
	}
	for collection, publicID := range map[string]string{"enquiry_notes": noteID, "tasks": taskID, "crm_enquiry_notes": noteID, "crm_tasks": taskID} {
		if count, err := db.Collection(collection).CountDocuments(ctx, bson.M{"public_id": publicID}); err != nil || count != 1 {
			t.Fatalf("%s count=%d err=%v", collection, count, err)
		}
	}
}
