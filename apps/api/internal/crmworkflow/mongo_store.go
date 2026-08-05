package crmworkflow

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ db *mongo.Database }

func NewMongoStore(db *mongo.Database) *MongoStore { return &MongoStore{db: db} }
func (s *MongoStore) tx(ctx context.Context, work func(context.Context) error) error {
	session, err := s.db.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) { return nil, work(tx) })
	return err
}
func (s *MongoStore) audit(ctx context.Context, a Audit) error {
	actor, err := bson.ObjectIDFromHex(a.ActorID)
	if err != nil {
		return ErrForbidden
	}
	_, err = s.db.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": a.PublicID, "actor_id": actor, "action": a.Action, "entity_type": a.EntityType, "entity_id": a.EntityID, "metadata": bson.M{}, "created_at": a.CreatedAt})
	return err
}
func mapped(err error) error {
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	if mongo.IsDuplicateKeyError(err) {
		return ErrConflict
	}
	return err
}
func (s *MongoStore) EnquiryExists(ctx context.Context, id string) (bool, error) {
	n, err := s.db.Collection("crm_enquiries").CountDocuments(ctx, bson.M{"public_id": id, "deleted_at": bson.M{"$exists": false}})
	return n == 1, err
}
func (s *MongoStore) AssigneeExists(ctx context.Context, id string) (bool, error) {
	actor, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return false, nil
	}
	n, err := s.db.Collection("users").CountDocuments(ctx, bson.M{"_id": actor, "status": "active"})
	return n == 1, err
}
func (s *MongoStore) CreateNote(ctx context.Context, v Note, a Audit) error {
	return s.tx(ctx, func(tx context.Context) error {
		_, err := s.db.Collection("crm_enquiry_notes").InsertOne(tx, bson.M{"public_id": v.PublicID, "enquiry_id": v.EnquiryID, "author_id": v.AuthorID, "body": v.Body, "created_at": v.CreatedAt})
		if err != nil {
			return mapped(err)
		}
		return s.audit(tx, a)
	})
}
func (s *MongoStore) CreateTask(ctx context.Context, v Task, a Audit) error {
	return s.tx(ctx, func(tx context.Context) error {
		_, err := s.db.Collection("crm_tasks").InsertOne(tx, bson.M{"public_id": v.PublicID, "enquiry_id": v.EnquiryID, "title": v.Title, "assignee_id": v.AssigneeID, "priority": v.Priority, "status": v.Status, "due_at": v.DueAt, "reminder_status": "pending", "created_at": v.CreatedAt, "updated_at": v.UpdatedAt})
		if err != nil {
			return mapped(err)
		}
		_, err = s.db.Collection("crm_notification_deliveries").InsertOne(tx, bson.M{"public_id": v.DeliveryID, "enquiry_id": v.EnquiryID, "task_id": v.PublicID, "kind": "task.assigned", "status": "pending", "attempts": 0, "next_attempt_at": v.CreatedAt, "created_at": v.CreatedAt, "updated_at": v.CreatedAt})
		if err != nil {
			return mapped(err)
		}
		return s.audit(tx, a)
	})
}
func (s *MongoStore) CompleteTask(ctx context.Context, enquiry, id string, at time.Time, a Audit) (Task, error) {
	var out Task
	err := s.tx(ctx, func(tx context.Context) error {
		err := s.db.Collection("crm_tasks").FindOneAndUpdate(tx, bson.M{"public_id": id, "enquiry_id": enquiry, "status": "open"}, bson.M{"$set": bson.M{"status": "done", "updated_at": at}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&out)
		if err != nil {
			return mapped(err)
		}
		return s.audit(tx, a)
	})
	return out, err
}
func (s *MongoStore) AddAttachment(ctx context.Context, v Attachment, a Audit) error {
	return s.tx(ctx, func(tx context.Context) error {
		asset, err := s.db.Collection("media_assets").UpdateOne(tx, bson.M{"public_id": v.AssetID, "status": "ready", "mime_type": bson.M{"$in": bson.A{"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}}}, bson.M{"$inc": bson.M{"reference_version": 1}})
		if err != nil {
			return err
		}
		if asset.MatchedCount != 1 {
			return ErrInvalid
		}
		_, err = s.db.Collection("crm_proposal_attachments").InsertOne(tx, bson.M{"public_id": v.PublicID, "enquiry_id": v.EnquiryID, "asset_id": v.AssetID, "label": v.Label, "added_by": v.AddedBy, "created_at": v.CreatedAt})
		if err != nil {
			return mapped(err)
		}
		if _, err = s.db.Collection("media_usage_references").InsertOne(tx, bson.M{"asset_id": v.AssetID, "entity_type": "proposal_attachment", "entity_id": v.PublicID, "field": "document", "created_at": v.CreatedAt}); err != nil {
			return mapped(err)
		}
		return s.audit(tx, a)
	})
}
func (s *MongoStore) FindAttachment(ctx context.Context, enquiry, id string) (Attachment, error) {
	var v Attachment
	err := s.db.Collection("crm_proposal_attachments").FindOne(ctx, bson.M{"public_id": id, "enquiry_id": enquiry}).Decode(&v)
	return v, mapped(err)
}
func (s *MongoStore) List(ctx context.Context, enquiry string) ([]Note, []Task, []StageHistory, []Attachment, error) {
	var notes []Note
	var tasks []Task
	var history []StageHistory
	var attachments []Attachment
	for name, target := range map[string]any{"crm_enquiry_notes": &notes, "crm_tasks": &tasks, "crm_stage_history": &history, "crm_proposal_attachments": &attachments} {
		cursor, err := s.db.Collection(name).Find(ctx, bson.M{"enquiry_id": enquiry}, options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}}))
		if err != nil {
			return nil, nil, nil, nil, err
		}
		if err = cursor.All(ctx, target); err != nil {
			return nil, nil, nil, nil, err
		}
	}
	return notes, tasks, history, attachments, nil
}
func (s *MongoStore) ListDeliveries(ctx context.Context, enquiry string) ([]Delivery, error) {
	cursor, err := s.db.Collection("crm_notification_deliveries").Find(ctx, bson.M{"enquiry_id": enquiry}, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}))
	if err != nil {
		return nil, err
	}
	var out []Delivery
	err = cursor.All(ctx, &out)
	return out, err
}
func (s *MongoStore) RetryDelivery(ctx context.Context, id string, at time.Time, a Audit) error {
	return s.tx(ctx, func(tx context.Context) error {
		r, err := s.db.Collection("crm_notification_deliveries").UpdateOne(tx, bson.M{"public_id": id, "status": bson.M{"$in": bson.A{"failed", "dead_letter"}}}, bson.M{"$set": bson.M{"status": "pending", "attempts": 0, "next_attempt_at": at, "updated_at": at, "last_error_code": ""}, "$unset": bson.M{"dead_lettered_at": ""}})
		if err != nil {
			return err
		}
		if r.MatchedCount != 1 {
			return ErrConflict
		}
		return s.audit(tx, a)
	})
}
func (s *MongoStore) RecordAudit(ctx context.Context, a Audit) error { return s.audit(ctx, a) }

var _ Store = (*MongoStore)(nil)
