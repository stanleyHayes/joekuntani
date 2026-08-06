package privacy

import (
	"context"
	"errors"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/crm"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct {
	database *mongo.Database
}

func NewMongoStore(database *mongo.Database) *MongoStore {
	return &MongoStore{database: database}
}

func (store *MongoStore) Status(ctx context.Context, _, cutoff time.Time) (Status, error) {
	eligible, err := store.database.Collection("enquiries").CountDocuments(ctx, eligibleFilter(cutoff))
	if err != nil {
		return Status{}, err
	}
	active, err := store.database.Collection("privacy_holds").CountDocuments(ctx, bson.M{"cleared_at": bson.M{"$exists": false}})
	if err != nil {
		return Status{}, err
	}
	return Status{EligibleCount: int(eligible), ActiveHolds: int(active)}, nil
}

func (store *MongoStore) PlaceHold(ctx context.Context, hold Hold) error {
	doc := bson.M{
		"public_id":  hold.PublicID,
		"contact_id": hold.ContactID,
		"reason":     hold.Reason,
		"created_at": hold.CreatedAt,
	}
	_, err := store.database.Collection("privacy_holds").InsertOne(ctx, doc)
	if mongo.IsDuplicateKeyError(err) {
		return ErrConflict
	}
	return err
}

func (store *MongoStore) ClearHold(ctx context.Context, contactID string, at time.Time) (Hold, error) {
	var doc struct {
		PublicID  string    `bson:"public_id"`
		ContactID string    `bson:"contact_id"`
		Reason    string    `bson:"reason"`
		CreatedAt time.Time `bson:"created_at"`
	}
	err := store.database.Collection("privacy_holds").FindOneAndUpdate(
		ctx,
		bson.M{"contact_id": contactID, "cleared_at": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"cleared_at": at}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Hold{}, ErrNotFound
	}
	if err != nil {
		return Hold{}, err
	}
	cleared := at
	return Hold{PublicID: doc.PublicID, ContactID: doc.ContactID, Reason: doc.Reason, CreatedAt: doc.CreatedAt, ClearedAt: &cleared}, nil
}

func (store *MongoStore) HasActiveHold(ctx context.Context, contactID string) (bool, error) {
	err := store.database.Collection("privacy_holds").FindOne(ctx, bson.M{"contact_id": contactID, "cleared_at": bson.M{"$exists": false}}).Err()
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (store *MongoStore) ListActiveHolds(ctx context.Context, limit int) ([]Hold, error) {
	cursor, err := store.database.Collection("privacy_holds").Find(ctx, bson.M{"cleared_at": bson.M{"$exists": false}}, options.Find().SetLimit(int64(limit)).SetSort(bson.D{{Key: "created_at", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var docs []struct {
		PublicID  string    `bson:"public_id"`
		ContactID string    `bson:"contact_id"`
		Reason    string    `bson:"reason"`
		CreatedAt time.Time `bson:"created_at"`
	}
	if err = cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	out := make([]Hold, len(docs))
	for i, doc := range docs {
		out[i] = Hold{PublicID: doc.PublicID, ContactID: doc.ContactID, Reason: doc.Reason, CreatedAt: doc.CreatedAt}
	}
	return out, nil
}

func (store *MongoStore) ListEligibleEnquiries(ctx context.Context, cutoff time.Time, limit int) ([]EnquiryCandidate, error) {
	cursor, err := store.database.Collection("enquiries").Find(ctx, eligibleFilter(cutoff), options.Find().SetLimit(int64(limit)).SetSort(bson.D{{Key: "updated_at", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var docs []struct {
		PublicID  string    `bson:"public_id"`
		Email     string    `bson:"contact.email"`
		UpdatedAt time.Time `bson:"updated_at"`
	}
	if err = cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	out := make([]EnquiryCandidate, 0, len(docs))
	for _, doc := range docs {
		candidate := EnquiryCandidate{PublicID: doc.PublicID, Email: doc.Email, UpdatedAt: doc.UpdatedAt}
		var linked struct {
			ContactID string `bson:"contact_id"`
		}
		linkErr := store.database.Collection("crm_enquiries").FindOne(ctx, bson.M{"source_enquiry_id": doc.PublicID}).Decode(&linked)
		if linkErr == nil {
			candidate.ContactID = linked.ContactID
		} else if !errors.Is(linkErr, mongo.ErrNoDocuments) {
			return nil, linkErr
		}
		out = append(out, candidate)
	}
	return out, nil
}

func (store *MongoStore) PurgeEnquiry(ctx context.Context, candidate EnquiryCandidate, at time.Time) error {
	session, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
		result, updateErr := store.database.Collection("enquiries").UpdateOne(tx, bson.M{
			"public_id":     candidate.PublicID,
			"contact.email": bson.M{"$nin": bson.A{"", anonymizedEmail}},
		}, bson.M{"$set": bson.M{
			"contact.name":         anonymizedName,
			"contact.email":        anonymizedEmail,
			"contact.phone":        "",
			"contact.organization": "",
			"contact.role":         "Deleted",
			"contact.country":      "ZZ",
			"updated_at":           at,
		}})
		if updateErr != nil {
			return nil, updateErr
		}
		if result.MatchedCount != 1 {
			return nil, ErrConflict
		}
		return nil, nil
	})
	return err
}

func (store *MongoStore) RecordAudit(ctx context.Context, actorID, action, entityType, entityID string, at time.Time) error {
	id, err := crm.UUID()
	if err != nil {
		return err
	}
	doc := bson.M{
		"public_id":   id,
		"action":      action,
		"entity_type": entityType,
		"entity_id":   entityID,
		"metadata":    bson.M{},
		"created_at":  at,
	}
	if objectID, parseErr := bson.ObjectIDFromHex(actorID); parseErr == nil {
		doc["actor_id"] = objectID
	}
	_, err = store.database.Collection("audit_logs").InsertOne(ctx, doc)
	return err
}

func eligibleFilter(cutoff time.Time) bson.M {
	return bson.M{
		"updated_at": bson.M{"$lt": cutoff},
		"contact.email": bson.M{
			"$exists": true,
			"$nin":    bson.A{"", anonymizedEmail},
		},
	}
}
