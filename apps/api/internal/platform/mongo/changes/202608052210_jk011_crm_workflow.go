package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const crmWorkflowChangeName = "202608052210_jk011_crm_workflow"

func crmWorkflowChange() Change {
	collections := exactCRMWorkflowCollections()
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: crmWorkflowChangeName, Checksum: Checksum(canonical), Apply: func(ctx context.Context, db *mongo.Database) error { return schema.Apply(ctx, db, collections) }, Verify: func(ctx context.Context, db *mongo.Database) error { return schema.Verify(ctx, db, collections) }}
}

func exactCRMWorkflowCollections() []schema.Collection {
	date := schema.Field("date")
	nullableDate := schema.Field("date", "null")
	publicID := schema.PublicIDField()
	staffID := bson.M{"bsonType": "string", "minLength": 1, "maxLength": 64}
	closed := func(required bson.A, properties bson.M) bson.M {
		return bson.M{"$jsonSchema": bson.M{"bsonType": "object", "additionalProperties": false, "required": required, "properties": properties}}
	}
	return []schema.Collection{
		{Name: "crm_enquiry_notes", Validator: closed(bson.A{"_id", "public_id", "enquiry_id", "author_id", "body", "created_at"}, bson.M{"_id": schema.Field("objectId"), "public_id": publicID, "enquiry_id": publicID, "author_id": staffID, "body": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 4000}, "created_at": date}), Indexes: []schema.Index{{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true}, {Name: "ix_note_enquiry_created", Keys: bson.D{{Key: "enquiry_id", Value: 1}, {Key: "created_at", Value: 1}}}}},
		{Name: "crm_tasks", Validator: closed(bson.A{"_id", "public_id", "enquiry_id", "title", "assignee_id", "priority", "status", "due_at", "reminder_status", "created_at", "updated_at"}, bson.M{"_id": schema.Field("objectId"), "public_id": publicID, "enquiry_id": publicID, "title": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 200}, "assignee_id": staffID, "priority": bson.M{"bsonType": "string", "enum": bson.A{"low", "normal", "high", "urgent"}}, "status": bson.M{"bsonType": "string", "enum": bson.A{"open", "done"}}, "due_at": date, "reminder_status": bson.M{"bsonType": "string", "enum": bson.A{"pending", "queued"}}, "created_at": date, "updated_at": date}), Indexes: []schema.Index{{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true}, {Name: "ix_task_assignee_status_due", Keys: bson.D{{Key: "assignee_id", Value: 1}, {Key: "status", Value: 1}, {Key: "due_at", Value: 1}}}, {Name: "ix_task_overdue_reminder", Keys: bson.D{{Key: "status", Value: 1}, {Key: "reminder_status", Value: 1}, {Key: "due_at", Value: 1}}}}},
		{Name: "crm_stage_history", Validator: closed(bson.A{"_id", "public_id", "enquiry_id", "actor_id", "from", "to", "created_at"}, bson.M{"_id": schema.Field("objectId"), "public_id": publicID, "enquiry_id": publicID, "actor_id": staffID, "from": bson.M{"bsonType": "string", "enum": bson.A{"", "new", "reviewing", "qualified", "call_scheduled", "proposal_sent", "negotiation", "won", "lost", "archived"}}, "to": bson.M{"bsonType": "string", "enum": bson.A{"new", "reviewing", "qualified", "call_scheduled", "proposal_sent", "negotiation", "won", "lost", "archived"}}, "created_at": date}), Indexes: []schema.Index{{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true}, {Name: "ix_stage_history_enquiry_created", Keys: bson.D{{Key: "enquiry_id", Value: 1}, {Key: "created_at", Value: 1}}}}},
		{Name: "crm_proposal_attachments", Validator: closed(bson.A{"_id", "public_id", "enquiry_id", "asset_id", "label", "added_by", "created_at"}, bson.M{"_id": schema.Field("objectId"), "public_id": publicID, "enquiry_id": publicID, "asset_id": publicID, "label": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 200}, "added_by": staffID, "created_at": date}), Indexes: []schema.Index{{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true}, {Name: "uq_proposal_enquiry_asset", Keys: bson.D{{Key: "enquiry_id", Value: 1}, {Key: "asset_id", Value: 1}}, Unique: true}}},
		{Name: "crm_notification_deliveries", Validator: closed(bson.A{"_id", "public_id", "enquiry_id", "task_id", "kind", "status", "attempts", "next_attempt_at", "created_at", "updated_at"}, bson.M{"_id": schema.Field("objectId"), "public_id": publicID, "enquiry_id": publicID, "task_id": bson.M{"bsonType": "string", "maxLength": 36}, "kind": bson.M{"bsonType": "string", "enum": bson.A{"task.assigned", "task.overdue", "enquiry.stage_changed"}}, "status": bson.M{"bsonType": "string", "enum": bson.A{"pending", "processing", "sent", "cancelled", "failed", "dead_letter"}}, "attempts": bson.M{"bsonType": bson.A{"int", "long"}, "minimum": 0, "maximum": 8}, "next_attempt_at": date, "lease_token": publicID, "claimed_at": nullableDate, "sent_at": nullableDate, "dead_lettered_at": nullableDate, "last_error_code": bson.M{"bsonType": "string", "maxLength": 80}, "created_at": date, "updated_at": date}), Indexes: []schema.Index{{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true}, {Name: "ix_crm_delivery_due", Keys: bson.D{{Key: "status", Value: 1}, {Key: "next_attempt_at", Value: 1}}}, {Name: "ix_crm_delivery_enquiry", Keys: bson.D{{Key: "enquiry_id", Value: 1}, {Key: "created_at", Value: -1}}}}},
	}
}
