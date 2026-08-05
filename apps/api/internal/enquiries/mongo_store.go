package enquiries

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ database *mongo.Database }

func NewMongoStore(database *mongo.Database) *MongoStore { return &MongoStore{database: database} }

func (store *MongoStore) Submit(ctx context.Context, key, requestHash string, enquiry Enquiry, messages []OutboxMessage) (Receipt, error) {
	keyHash := tokenHash(key)
	var receipt Receipt
	session, err := store.database.Client().StartSession()
	if err != nil {
		return receipt, err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
		var existing struct {
			Reference   string `bson:"reference"`
			RequestHash string `bson:"request_hash"`
		}
		err := store.database.Collection("enquiry_idempotency").FindOne(tx, bson.M{"key_hash": keyHash}).Decode(&existing)
		if err == nil {
			if existing.RequestHash != requestHash {
				return nil, ErrInvalid
			}
			receipt.Reference = existing.Reference
			return nil, nil
		}
		if !errors.Is(err, mongo.ErrNoDocuments) {
			return nil, err
		}
		if _, err = store.database.Collection("enquiries").InsertOne(tx, enquiryDocument(enquiry)); err != nil {
			return nil, err
		}
		documents := make([]any, len(messages))
		for index, message := range messages {
			documents[index] = bson.M{"public_id": message.PublicID, "enquiry_id": message.EnquiryID, "kind": message.Kind, "status": "pending", "attempts": message.Attempts, "next_attempt_at": message.NextAttemptAt, "created_at": enquiry.CreatedAt, "updated_at": enquiry.CreatedAt}
		}
		if _, err = store.database.Collection("notification_outbox").InsertMany(tx, documents); err != nil {
			return nil, err
		}
		if _, err = store.database.Collection("enquiry_idempotency").InsertOne(tx, bson.M{"key_hash": keyHash, "request_hash": requestHash, "reference": enquiry.Reference, "enquiry_id": enquiry.PublicID, "created_at": enquiry.CreatedAt}); err != nil {
			return nil, err
		}
		receipt = Receipt{Reference: enquiry.Reference, Stored: true}
		return nil, nil
	})
	if err == nil {
		return receipt, nil
	}
	if mongo.IsDuplicateKeyError(err) {
		var existing struct {
			Reference   string `bson:"reference"`
			RequestHash string `bson:"request_hash"`
		}
		if findErr := store.database.Collection("enquiry_idempotency").FindOne(ctx, bson.M{"key_hash": keyHash}).Decode(&existing); findErr == nil {
			if existing.RequestHash != requestHash {
				return Receipt{}, ErrInvalid
			}
			return Receipt{Reference: existing.Reference}, nil
		}
		return Receipt{}, ErrReferenceConflict
	}
	return Receipt{}, err
}

func (store *MongoStore) ClaimDue(ctx context.Context, now time.Time, limit int) ([]OutboxMessage, error) {
	if limit < 1 || limit > 100 {
		return nil, fmt.Errorf("claim limit out of range")
	}
	messages := make([]OutboxMessage, 0, limit)
	for len(messages) < limit {
		var document struct {
			PublicID      string    `bson:"public_id"`
			EnquiryID     string    `bson:"enquiry_id"`
			Kind          string    `bson:"kind"`
			Attempts      int       `bson:"attempts"`
			NextAttemptAt time.Time `bson:"next_attempt_at"`
		}
		err := store.database.Collection("notification_outbox").FindOneAndUpdate(ctx,
			bson.M{"$or": bson.A{bson.M{"status": "pending", "next_attempt_at": bson.M{"$lte": now}}, bson.M{"status": "processing", "claimed_at": bson.M{"$lte": now.Add(-2 * time.Minute)}}}},
			bson.M{"$set": bson.M{"status": "processing", "claimed_at": now, "updated_at": now}},
			options.FindOneAndUpdate().SetSort(bson.D{{Key: "next_attempt_at", Value: 1}, {Key: "public_id", Value: 1}}).SetReturnDocument(options.After),
		).Decode(&document)
		if errors.Is(err, mongo.ErrNoDocuments) {
			break
		}
		if err != nil {
			return nil, err
		}
		messages = append(messages, OutboxMessage{PublicID: document.PublicID, EnquiryID: document.EnquiryID, Kind: document.Kind, Attempts: document.Attempts, NextAttemptAt: document.NextAttemptAt})
	}
	return messages, nil
}

func (store *MongoStore) Complete(ctx context.Context, publicID string) error {
	now := time.Now().UTC()
	result, err := store.database.Collection("notification_outbox").UpdateOne(ctx, bson.M{"public_id": publicID, "status": "processing"}, bson.M{"$set": bson.M{"status": "sent", "sent_at": now, "updated_at": now}, "$unset": bson.M{"claimed_at": ""}})
	if err != nil {
		return err
	}
	if result.MatchedCount != 1 {
		return fmt.Errorf("complete outbox message matched %d records", result.MatchedCount)
	}
	return nil
}

func (store *MongoStore) Retry(ctx context.Context, publicID string, attempts int, next time.Time, dead *time.Time) error {
	status := "pending"
	set := bson.M{"status": status, "attempts": attempts, "next_attempt_at": next, "updated_at": time.Now().UTC()}
	if dead != nil {
		set["status"] = "dead_letter"
		set["dead_lettered_at"] = dead
	}
	result, err := store.database.Collection("notification_outbox").UpdateOne(ctx, bson.M{"public_id": publicID, "status": "processing"}, bson.M{"$set": set, "$unset": bson.M{"claimed_at": ""}})
	if err != nil {
		return err
	}
	if result.MatchedCount != 1 {
		return fmt.Errorf("retry outbox message matched %d records", result.MatchedCount)
	}
	return nil
}

func enquiryDocument(item Enquiry) bson.M {
	return bson.M{"public_id": item.PublicID, "reference": item.Reference, "service_id": item.ServiceID, "enquiry_type": item.EnquiryType, "source": item.Source, "contact": item.Contact, "details": item.Details, "answers": item.Answers, "project_brief": item.ProjectBrief, "budget": item.Budget, "timeline": item.Timeline, "currency": item.Currency, "decision_deadline": item.DecisionDeadline, "additional_notes": item.AdditionalNotes, "marketing_consent": item.MarketingConsent, "consent_text": item.ConsentText, "consent_version": item.ConsentVersion, "consent_at": item.ConsentAt, "ip_hash": item.IPHash, "status": "new", "created_at": item.CreatedAt, "updated_at": item.CreatedAt}
}
func tokenHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
