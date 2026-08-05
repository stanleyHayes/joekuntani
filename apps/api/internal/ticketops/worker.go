package ticketops

import (
	"context"
	"errors"
	"math"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Communication struct {
	ID, OrderReference, BuyerEmail, Reason string
}

type CommunicationSender interface {
	SendCancellation(context.Context, Communication) error
}

type CommunicationWorker struct {
	db      *mongo.Database
	sender  CommunicationSender
	now     func() time.Time
	claimID func() (string, error)
}

func NewCommunicationWorker(db *mongo.Database, sender CommunicationSender) (*CommunicationWorker, error) {
	if db == nil || sender == nil {
		return nil, ErrInvalid
	}
	return &CommunicationWorker{db: db, sender: sender, now: time.Now, claimID: UUID}, nil
}

func (w *CommunicationWorker) RunOnce(ctx context.Context, limit int) error {
	if limit < 1 || limit > 100 {
		return ErrInvalid
	}
	now := w.now().UTC()
	for range limit {
		claim, err := w.claimID()
		if err != nil {
			return err
		}
		var item struct {
			PublicID       string        `bson:"public_id"`
			OrderID        bson.ObjectID `bson:"order_id"`
			OrderReference string        `bson:"order_reference"`
			Reason         string        `bson:"reason"`
			Attempts       int           `bson:"attempts"`
		}
		err = w.db.Collection("ticket_communications").FindOneAndUpdate(ctx,
			bson.M{"$or": bson.A{bson.M{"status": "pending", "next_attempt_at": bson.M{"$lte": now}}, bson.M{"status": "processing", "claimed_at": bson.M{"$lte": now.Add(-2 * time.Minute)}}}},
			bson.M{"$set": bson.M{"status": "processing", "claim_token": claim, "claimed_at": now, "updated_at": now}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&item)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil
		}
		if err != nil {
			return err
		}
		var order struct {
			BuyerEmail string `bson:"buyer_email"`
		}
		if err = w.db.Collection("ticket_orders").FindOne(ctx, bson.M{"_id": item.OrderID}).Decode(&order); err != nil {
			return err
		}
		delivery := Communication{ID: item.PublicID, OrderReference: item.OrderReference, BuyerEmail: order.BuyerEmail, Reason: item.Reason}
		if err = w.sender.SendCancellation(ctx, delivery); err == nil {
			result, updateErr := w.db.Collection("ticket_communications").UpdateOne(ctx, bson.M{"public_id": item.PublicID, "status": "processing", "claim_token": claim}, bson.M{"$set": bson.M{"status": "sent", "sent_at": now, "updated_at": now}, "$unset": bson.M{"claim_token": "", "claimed_at": ""}})
			if updateErr != nil {
				return updateErr
			}
			if result.MatchedCount != 1 {
				continue
			}
			continue
		}
		attempts := item.Attempts + 1
		set := bson.M{"status": "pending", "attempts": attempts, "next_attempt_at": now.Add(time.Duration(math.Min(math.Pow(2, float64(attempts)), 3600)) * time.Second), "last_error_code": "delivery_failed", "updated_at": now}
		if attempts >= 8 {
			set["status"] = "dead_letter"
			set["dead_lettered_at"] = now
		}
		if _, err = w.db.Collection("ticket_communications").UpdateOne(ctx, bson.M{"public_id": item.PublicID, "status": "processing", "claim_token": claim}, bson.M{"$set": set, "$unset": bson.M{"claim_token": "", "claimed_at": ""}}); err != nil {
			return err
		}
	}
	return nil
}
