package crmworkflow

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type recordingSender struct{ sent []InternalNotification }

func (s *recordingSender) Send(_ context.Context, v InternalNotification) error {
	s.sent = append(s.sent, v)
	return nil
}

type senderFunc func(context.Context, InternalNotification) error

func (f senderFunc) Send(ctx context.Context, value InternalNotification) error { return f(ctx, value) }

func TestMongoWorkflowAtomicAuditReminderAndProtectedAttachment(t *testing.T) {
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
	db := client.Database("jk011_" + bson.NewObjectID().Hex())
	defer db.Drop(ctx)
	for _, name := range []string{"crm_enquiries", "crm_enquiry_notes", "crm_tasks", "crm_stage_history", "crm_proposal_attachments", "crm_notification_deliveries", "media_assets", "media_usage_references", "audit_logs", "users"} {
		if err = db.CreateCollection(ctx, name); err != nil {
			t.Fatal(err)
		}
	}
	for collection := range map[string]bool{"crm_enquiry_notes": true, "crm_tasks": true, "crm_stage_history": true, "crm_proposal_attachments": true, "crm_notification_deliveries": true} {
		_, err = db.Collection(collection).Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "public_id", Value: 1}}, Options: options.Index().SetUnique(true)})
		if err != nil {
			t.Fatal(err)
		}
	}
	enquiryID := "00000000-0000-4000-8000-000000000099"
	assetID := "00000000-0000-4000-8000-000000000088"
	if _, err = db.Collection("crm_enquiries").InsertOne(ctx, bson.M{"public_id": enquiryID}); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Collection("media_assets").InsertOne(ctx, bson.M{"public_id": assetID, "status": "ready", "mime_type": "application/pdf", "public_url": "https://res.cloudinary.com/demo/private.pdf"}); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 8, 5, 17, 0, 0, 0, time.UTC)
	clock := now
	n := 0
	ids := func() (string, error) { n++; return fmt.Sprintf("00000000-0000-4000-8000-%012d", n), nil }
	signer, err := NewAssetSigner(db, []byte("0123456789abcdef0123456789abcdef"), "https://example.test", func() time.Time { return clock })
	if err != nil {
		t.Fatal(err)
	}
	service := New(NewMongoStore(db), signer, nil, func() time.Time { return clock }, ids)
	actor := Actor{InternalID: bson.NewObjectID().Hex(), Permissions: map[Permission]bool{PermissionRead: true, PermissionWrite: true, PermissionRetry: true}}
	actorID, _ := bson.ObjectIDFromHex(actor.InternalID)
	if _, err = db.Collection("users").InsertOne(ctx, bson.M{"_id": actorID, "status": "active"}); err != nil {
		t.Fatal(err)
	}
	badActor := Actor{InternalID: "not-an-object-id", Permissions: map[Permission]bool{PermissionWrite: true}}
	if _, err = service.AddNote(ctx, badActor, enquiryID, NoteInput{Body: "must roll back"}); err != ErrForbidden {
		t.Fatalf("audit failure=%v", err)
	}
	if count, _ := db.Collection("crm_enquiry_notes").CountDocuments(ctx, bson.M{}); count != 0 {
		t.Fatalf("note survived audit rollback: %d", count)
	}
	if _, err = service.AddNote(ctx, actor, enquiryID, NoteInput{Body: "Private context"}); err != nil {
		t.Fatal(err)
	}
	task, err := service.AddTask(ctx, actor, enquiryID, TaskInput{Title: "Call client", AssigneeID: actor.InternalID, Priority: PriorityHigh, DueAt: now.Add(time.Hour)})
	if err != nil {
		t.Fatal(err)
	}
	attachment, err := service.AddAttachment(ctx, actor, enquiryID, AttachmentInput{AssetID: assetID, Label: "Proposal"})
	if err != nil {
		t.Fatal(err)
	}
	access, err := service.AttachmentURL(ctx, actor, enquiryID, attachment.PublicID)
	if err != nil || !strings.Contains(access.URL, "signature=") {
		t.Fatalf("access=%#v %v", access, err)
	}
	u, _ := url.Parse(access.URL)
	if target, resolveErr := signer.Resolve(ctx, u.Query().Get("asset"), u.Query().Get("expires"), u.Query().Get("signature")); resolveErr != nil || !strings.HasPrefix(target, "https://res.cloudinary.com/") {
		t.Fatalf("resolve=%q %v", target, resolveErr)
	}
	clock = access.ExpiresAt.Add(time.Second)
	if _, resolveErr := signer.Resolve(ctx, u.Query().Get("asset"), u.Query().Get("expires"), u.Query().Get("signature")); resolveErr != ErrForbidden {
		t.Fatalf("expired=%v", resolveErr)
	}
	clock = now
	sender := &recordingSender{}
	worker := NewReminderWorker(db, sender, func() time.Time { return clock }, ids)
	if err = worker.RunOnce(ctx, 10); err != nil {
		t.Fatal(err)
	}
	clock = now.Add(2 * time.Hour)
	if err = worker.QueueOverdue(ctx, 10); err != nil {
		t.Fatal(err)
	}
	if err = worker.RunOnce(ctx, 10); err != nil {
		t.Fatal(err)
	}
	if len(sender.sent) != 2 || sender.sent[0].TaskID != task.PublicID || sender.sent[1].Kind != "task.overdue" {
		t.Fatalf("sent=%#v", sender.sent)
	}
	hijackID, _ := ids()
	if _, err = db.Collection("crm_notification_deliveries").InsertOne(ctx, bson.M{"public_id": hijackID, "enquiry_id": enquiryID, "task_id": task.PublicID, "kind": "task.assigned", "status": "pending", "attempts": 0, "next_attempt_at": clock, "created_at": clock, "updated_at": clock}); err != nil {
		t.Fatal(err)
	}
	hijacker := NewReminderWorker(db, senderFunc(func(ctx context.Context, delivery InternalNotification) error {
		_, updateErr := db.Collection("crm_notification_deliveries").UpdateOne(ctx, bson.M{"public_id": delivery.PublicID}, bson.M{"$set": bson.M{"lease_token": "new-owner"}})
		return updateErr
	}), func() time.Time { return clock }, ids)
	if err = hijacker.RunOnce(ctx, 1); err != ErrConflict {
		t.Fatalf("stale completion=%v", err)
	}
	var fenced bson.M
	if err = db.Collection("crm_notification_deliveries").FindOne(ctx, bson.M{"public_id": hijackID}).Decode(&fenced); err != nil || fenced["status"] != "processing" || fenced["lease_token"] != "new-owner" {
		t.Fatalf("fenced=%#v %v", fenced, err)
	}
	_, _ = db.Collection("crm_notification_deliveries").UpdateOne(ctx, bson.M{"public_id": hijackID}, bson.M{"$set": bson.M{"status": "sent"}})
	failureID, _ := ids()
	if _, err = db.Collection("crm_notification_deliveries").InsertOne(ctx, bson.M{"public_id": failureID, "enquiry_id": enquiryID, "task_id": task.PublicID, "kind": "task.overdue", "status": "pending", "attempts": 0, "next_attempt_at": clock, "created_at": clock, "updated_at": clock}); err != nil {
		t.Fatal(err)
	}
	failing := NewReminderWorker(db, senderFunc(func(context.Context, InternalNotification) error { return errors.New("provider unavailable") }), func() time.Time { return clock }, ids)
	for range 8 {
		if err = failing.RunOnce(ctx, 1); err != nil {
			t.Fatal(err)
		}
		clock = clock.Add(2 * time.Hour)
	}
	var dead Delivery
	if err = db.Collection("crm_notification_deliveries").FindOne(ctx, bson.M{"public_id": failureID}).Decode(&dead); err != nil || dead.Status != "dead_letter" || dead.Attempts != 8 || dead.LastErrorCode != "delivery_failed" {
		t.Fatalf("dead=%#v %v", dead, err)
	}
	if err = service.Retry(ctx, actor, enquiryID, failureID); err != nil {
		t.Fatal(err)
	}
	for collection, want := range map[string]int64{"crm_enquiry_notes": 1, "crm_tasks": 1, "crm_proposal_attachments": 1, "media_usage_references": 1, "crm_notification_deliveries": 4, "audit_logs": 5} {
		got, e := db.Collection(collection).CountDocuments(ctx, bson.M{})
		if e != nil || got != want {
			t.Fatalf("%s=%d want %d: %v", collection, got, want, e)
		}
	}
}
