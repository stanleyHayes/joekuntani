package crmworkflow

import (
	"context"
	"errors"
	"math"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type InternalNotification struct{ PublicID, Kind, EnquiryID, TaskID, AssigneeID string }
type Sender interface {
	Send(context.Context, InternalNotification) error
}
type UnavailableSender struct{}

func (UnavailableSender) Send(context.Context, InternalNotification) error {
	return errors.New("CRM notification delivery unavailable")
}

type ReminderWorker struct {
	db     *mongo.Database
	sender Sender
	now    func() time.Time
	id     func() (string, error)
}

func NewReminderWorker(db *mongo.Database, sender Sender, now func() time.Time, id func() (string, error)) *ReminderWorker {
	if now == nil {
		now = time.Now
	}
	return &ReminderWorker{db: db, sender: sender, now: now, id: id}
}

func (w *ReminderWorker) QueueOverdue(ctx context.Context, limit int) error {
	if limit < 1 || limit > 100 {
		return ErrInvalid
	}
	now := w.now().UTC()
	cursor, err := w.db.Collection("crm_tasks").Find(ctx, bson.M{"status": "open", "due_at": bson.M{"$lt": now}, "reminder_status": "pending"}, options.Find().SetLimit(int64(limit)))
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var task Task
		if err = cursor.Decode(&task); err != nil {
			return err
		}
		id, err := w.id()
		if err != nil {
			return err
		}
		session, err := w.db.Client().StartSession()
		if err != nil {
			return err
		}
		_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
			r, e := w.db.Collection("crm_tasks").UpdateOne(tx, bson.M{"public_id": task.PublicID, "status": "open", "reminder_status": "pending"}, bson.M{"$set": bson.M{"reminder_status": "queued", "updated_at": now}})
			if e != nil || r.ModifiedCount != 1 {
				return nil, e
			}
			_, e = w.db.Collection("crm_notification_deliveries").InsertOne(tx, bson.M{"public_id": id, "enquiry_id": task.EnquiryID, "task_id": task.PublicID, "kind": "task.overdue", "status": "pending", "attempts": 0, "next_attempt_at": now, "created_at": now, "updated_at": now})
			return nil, e
		})
		session.EndSession(ctx)
		if err != nil {
			return err
		}
	}
	return cursor.Err()
}

func (w *ReminderWorker) RunOnce(ctx context.Context, limit int) error {
	if limit < 1 || limit > 100 {
		return ErrInvalid
	}
	for range limit {
		now := w.now().UTC()
		lease, err := w.id()
		if err != nil {
			return err
		}
		var item struct {
			PublicID  string `bson:"public_id"`
			EnquiryID string `bson:"enquiry_id"`
			TaskID    string `bson:"task_id"`
			Kind      string `bson:"kind"`
			Attempts  int    `bson:"attempts"`
			Lease     string `bson:"lease_token"`
		}
		err = w.db.Collection("crm_notification_deliveries").FindOneAndUpdate(ctx, bson.M{"$or": bson.A{bson.M{"status": "pending", "next_attempt_at": bson.M{"$lte": now}}, bson.M{"status": "processing", "claimed_at": bson.M{"$lte": now.Add(-2 * time.Minute)}}}}, bson.M{"$set": bson.M{"status": "processing", "lease_token": lease, "claimed_at": now, "updated_at": now}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&item)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil
		}
		if err != nil {
			return err
		}
		var assigneeID string
		if item.TaskID != "" {
			var task Task
			if err = w.db.Collection("crm_tasks").FindOne(ctx, bson.M{"public_id": item.TaskID}).Decode(&task); err != nil {
				return err
			}
			assigneeID = task.AssigneeID
			if item.Kind == "task.overdue" && task.Status == TaskDone {
				_, e := w.db.Collection("crm_notification_deliveries").UpdateOne(ctx, bson.M{"public_id": item.PublicID, "status": "processing", "lease_token": lease}, bson.M{"$set": bson.M{"status": "cancelled", "updated_at": now}, "$unset": bson.M{"claimed_at": "", "lease_token": ""}})
				if e != nil {
					return e
				}
				continue
			}
		} else {
			var enquiry struct {
				OwnerID string `bson:"owner_id"`
			}
			if err = w.db.Collection("crm_enquiries").FindOne(ctx, bson.M{"public_id": item.EnquiryID, "deleted_at": bson.M{"$exists": false}}).Decode(&enquiry); err != nil {
				return err
			}
			assigneeID = enquiry.OwnerID
		}
		sendErr := w.sender.Send(ctx, InternalNotification{item.PublicID, item.Kind, item.EnquiryID, item.TaskID, assigneeID})
		filter := bson.M{"public_id": item.PublicID, "status": "processing", "lease_token": lease}
		if sendErr == nil {
			r, e := w.db.Collection("crm_notification_deliveries").UpdateOne(ctx, filter, bson.M{"$set": bson.M{"status": "sent", "sent_at": now, "updated_at": now}, "$unset": bson.M{"claimed_at": "", "lease_token": ""}})
			if e != nil {
				return e
			}
			if r.ModifiedCount != 1 {
				return ErrConflict
			}
			continue
		}
		attempts := item.Attempts + 1
		status := "pending"
		if attempts >= 8 {
			status = "dead_letter"
		}
		delay := time.Duration(math.Min(math.Pow(2, float64(attempts)), 3600)) * time.Second
		set := bson.M{"status": status, "attempts": attempts, "next_attempt_at": now.Add(delay), "last_error_code": "delivery_failed", "updated_at": now}
		if status == "dead_letter" {
			set["dead_lettered_at"] = now
		}
		r, e := w.db.Collection("crm_notification_deliveries").UpdateOne(ctx, filter, bson.M{"$set": set, "$unset": bson.M{"claimed_at": "", "lease_token": ""}})
		if e != nil {
			return e
		}
		if r.ModifiedCount != 1 {
			return ErrConflict
		}
	}
	return nil
}
