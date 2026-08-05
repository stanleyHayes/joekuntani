package crm

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func TestMongoStoreCRMTransactionSourceAndPrivacyLifecycle(t *testing.T) {
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
	db := client.Database("jk010_crm_" + bson.NewObjectID().Hex())
	defer db.Drop(ctx)
	for collection, models := range map[string][]mongo.IndexModel{
		"organizations":   {{Keys: bson.D{{Key: "public_id", Value: 1}}, Options: options.Index().SetUnique(true)}},
		"contacts":        {{Keys: bson.D{{Key: "public_id", Value: 1}}, Options: options.Index().SetUnique(true)}, {Keys: bson.D{{Key: "normalized_email", Value: 1}}, Options: options.Index().SetUnique(true).SetPartialFilterExpression(bson.M{"normalized_email": bson.M{"$gt": ""}})}},
		"crm_enquiries":   {{Keys: bson.D{{Key: "public_id", Value: 1}}, Options: options.Index().SetUnique(true)}, {Keys: bson.D{{Key: "source_enquiry_id", Value: 1}}, Options: options.Index().SetUnique(true)}},
		"crm_saved_views": {{Keys: bson.D{{Key: "owner_id", Value: 1}, {Key: "name", Value: 1}}, Options: options.Index().SetUnique(true)}},
	} {
		if _, err = db.Collection(collection).Indexes().CreateMany(ctx, models); err != nil {
			t.Fatal(err)
		}
	}
	sourceID := "00000000-0000-4000-8000-000000000099"
	if _, err = db.Collection("enquiries").InsertOne(ctx, bson.M{"public_id": sourceID, "reference": "JK-2026-AUTH", "service_id": "00000000-0000-4000-8000-000000000077", "source": "referral", "enquiry_type": "event", "contact": bson.M{"name": "Source Person", "email": "source@example.com", "phone": "+233200000000", "organization": "Source Org", "role": "Manager", "country": "GH"}}); err != nil {
		t.Fatal(err)
	}
	n := 0
	ids := func() (string, error) { n++; return fmt.Sprintf("00000000-0000-4000-8000-%012d", n), nil }
	now := func() time.Time { return time.Date(2026, 8, 5, 17, 0, 0, 0, time.UTC) }
	service := NewService(NewMongoStore(db), now, ids)
	actor := Actor{InternalID: bson.NewObjectID().Hex(), Permissions: map[Permission]bool{PermissionRead: true, PermissionWrite: true, PermissionAssign: true, PermissionPrivacyExport: true, PermissionPrivacyDelete: true}}
	if _, err = service.CreateOrganization(ctx, Actor{InternalID: "not-object-id", Permissions: map[Permission]bool{PermissionWrite: true}}, OrganizationInput{Name: "Rollback Org"}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("invalid audit actor = %v", err)
	}
	if count, _ := db.Collection("organizations").CountDocuments(ctx, bson.M{}); count != 0 {
		t.Fatalf("organization survived audit rollback: %d", count)
	}
	org, err := service.CreateOrganization(ctx, actor, OrganizationInput{Name: "Neurodyne", Website: "https://example.com", CountryCode: "GH"})
	if err != nil {
		t.Fatal(err)
	}
	contact, err := service.CreateContact(ctx, actor, ContactInput{OrganizationID: org.PublicID, Name: "Ama Mensah", Email: " AMA@Example.com ", Phone: "+233 (24) 123-4567"})
	if err != nil {
		t.Fatal(err)
	}
	if found, e := service.LookupContact(ctx, actor, "ama@example.COM", ""); e != nil || found.PublicID != contact.PublicID {
		t.Fatalf("lookup=%#v %v", found, e)
	}
	enquiry, err := service.CreateEnquiry(ctx, actor, EnquiryInput{SourceEnquiryID: sourceID, ContactID: contact.PublicID, OrganizationID: org.PublicID, Summary: "private summary"})
	if err != nil {
		t.Fatal(err)
	}
	if enquiry.Reference != "JK-2026-AUTH" || enquiry.ServiceID != "00000000-0000-4000-8000-000000000077" || enquiry.Source != "referral" || enquiry.EnquiryType != "event" {
		t.Fatalf("forged attribution persisted: %#v", enquiry)
	}
	owner := "00000000-0000-4000-8000-000000000088"
	if _, err = service.Assign(ctx, actor, enquiry.PublicID, owner); err != nil {
		t.Fatal(err)
	}
	if _, err = service.SetStage(ctx, actor, enquiry.PublicID, StageReviewing); err != nil {
		t.Fatal(err)
	}
	filter := EnquiryFilter{Stages: []Stage{StageReviewing}, OwnerID: owner, Sources: []string{"referral"}}
	if _, err = service.SaveView(ctx, actor, "Contacted", filter); err != nil {
		t.Fatal(err)
	}
	views, err := service.ListViews(ctx, actor)
	if err != nil || len(views) != 1 {
		t.Fatalf("views=%#v %v", views, err)
	}
	export, err := service.PrivacyExport(ctx, actor, contact.PublicID)
	if err != nil || len(export.Enquiries) != 1 || export.Organization == nil {
		t.Fatalf("export=%#v %v", export, err)
	}
	deleted, err := service.PrivacyDelete(ctx, actor, contact.PublicID)
	if err != nil || deleted.Contacts != 1 || deleted.Organizations != 1 || deleted.Enquiries != 1 {
		t.Fatalf("delete=%#v %v", deleted, err)
	}
	var source bson.M
	if err = db.Collection("enquiries").FindOne(ctx, bson.M{"public_id": sourceID}).Decode(&source); err != nil {
		t.Fatalf("JK-009 source changed or removed: %v", err)
	}
	sourceContact := source["contact"].(bson.D)
	values := map[string]any{}
	for _, field := range sourceContact {
		values[field.Key] = field.Value
	}
	if source["reference"] != "JK-2026-AUTH" || values["name"] != "Deleted contact" || values["email"] != "deleted@example.invalid" || values["phone"] != "" || values["organization"] != "" {
		t.Fatalf("source identity/privacy mismatch: %#v", source)
	}
	contactRaw, err := db.Collection("contacts").CountDocuments(ctx, bson.M{"public_id": contact.PublicID, "email": "", "deleted_at": now()})
	if err != nil || contactRaw != 1 {
		t.Fatalf("contact not anonymized: %d %v", contactRaw, err)
	}
	if audits, err := db.Collection("audit_logs").CountDocuments(ctx, bson.M{"actor_id": bson.M{"$eq": mustObjectID(actor.InternalID)}}); err != nil || audits != 8 {
		t.Fatalf("audits=%d want 8: %v", audits, err)
	}
}

func mustObjectID(value string) bson.ObjectID { id, _ := bson.ObjectIDFromHex(value); return id }
