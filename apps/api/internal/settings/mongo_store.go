package settings

import (
	"context"
	"crypto/rand"
	"errors"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ database *mongo.Database }

const settingsCollection = "global_settings"

func NewMongoStore(database *mongo.Database) *MongoStore { return &MongoStore{database: database} }

type mongoDocument struct {
	Key             string        `bson:"key"`
	Version         int64         `bson:"version"`
	Draft           Values        `bson:"draft"`
	Published       *Values       `bson:"published"`
	ContentComplete bool          `bson:"content_complete"`
	UpdatedBy       bson.ObjectID `bson:"updated_by"`
	UpdatedAt       time.Time     `bson:"updated_at"`
	PublishedAt     *time.Time    `bson:"published_at"`
}

func fromMongo(value mongoDocument) Document {
	return Document{Key: value.Key, Version: value.Version, Draft: value.Draft, Published: value.Published, ContentComplete: value.ContentComplete, UpdatedBy: value.UpdatedBy.Hex(), UpdatedAt: value.UpdatedAt, PublishedAt: value.PublishedAt}
}
func (store *MongoStore) Get(ctx context.Context) (Document, error) {
	var value mongoDocument
	err := store.database.Collection(settingsCollection).FindOne(ctx, bson.M{"key": GlobalKey}).Decode(&value)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Document{}, ErrNotFound
	}
	if err != nil {
		return Document{}, err
	}
	return fromMongo(value), nil
}
func (store *MongoStore) Update(ctx context.Context, expected int64, values Values, complete bool, actor auth.Principal, now time.Time) (Document, error) {
	actorID, err := bson.ObjectIDFromHex(actor.InternalUserID)
	if err != nil {
		return Document{}, ErrForbidden
	}
	session, err := store.database.Client().StartSession()
	if err != nil {
		return Document{}, err
	}
	defer session.EndSession(ctx)
	var updated mongoDocument
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
		filter := bson.M{"key": GlobalKey, "version": expected}
		update := bson.M{"$set": bson.M{"draft": values, "content_complete": complete, "updated_by": actorID, "updated_at": now}, "$inc": bson.M{"version": 1}, "$setOnInsert": bson.M{"published": nil, "published_at": nil}}
		opts := options.FindOneAndUpdate().SetReturnDocument(options.After).SetUpsert(expected == 0)
		if err := store.database.Collection(settingsCollection).FindOneAndUpdate(tx, filter, update, opts).Decode(&updated); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) || mongo.IsDuplicateKeyError(err) {
				return nil, ErrConflict
			}
			return nil, err
		}
		publicID, err := newUUID()
		if err != nil {
			return nil, err
		}
		audit := bson.M{"public_id": publicID, "actor_id": actorID, "action": "settings.update", "entity_type": settingsCollection, "entity_id": GlobalKey, "metadata": bson.M{"from_version": expected, "to_version": expected + 1, "content_complete": complete}, "created_at": now}
		_, err = store.database.Collection("audit_logs").InsertOne(tx, audit)
		return nil, err
	})
	if err != nil {
		return Document{}, err
	}
	return fromMongo(updated), nil
}
func (store *MongoStore) Publish(ctx context.Context, expected int64, actor auth.Principal, now time.Time) (Document, error) {
	actorID, err := bson.ObjectIDFromHex(actor.InternalUserID)
	if err != nil {
		return Document{}, ErrForbidden
	}
	session, err := store.database.Client().StartSession()
	if err != nil {
		return Document{}, err
	}
	defer session.EndSession(ctx)
	var updated mongoDocument
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
		var current mongoDocument
		if err := store.database.Collection(settingsCollection).FindOne(tx, bson.M{"key": GlobalKey, "version": expected, "content_complete": true}).Decode(&current); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				return nil, ErrConflict
			}
			return nil, err
		}
		err := store.database.Collection(settingsCollection).FindOneAndUpdate(tx, bson.M{"key": GlobalKey, "version": expected}, bson.M{"$set": bson.M{"published": current.Draft, "published_at": now, "updated_by": actorID, "updated_at": now}, "$inc": bson.M{"version": 1}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&updated)
		if err != nil {
			return nil, ErrConflict
		}
		publicID, err := newUUID()
		if err != nil {
			return nil, err
		}
		_, err = store.database.Collection("audit_logs").InsertOne(tx, bson.M{"public_id": publicID, "actor_id": actorID, "action": "settings.publish", "entity_type": settingsCollection, "entity_id": GlobalKey, "metadata": bson.M{"from_version": expected, "to_version": expected + 1}, "created_at": now})
		return nil, err
	})
	if err != nil {
		return Document{}, err
	}
	return fromMongo(updated), nil
}
func newUUID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return hex(value[0:4]) + "-" + hex(value[4:6]) + "-" + hex(value[6:8]) + "-" + hex(value[8:10]) + "-" + hex(value[10:16]), nil
}
func hex(value []byte) string {
	const alphabet = "0123456789abcdef"
	result := make([]byte, len(value)*2)
	for i, item := range value {
		result[i*2] = alphabet[item>>4]
		result[i*2+1] = alphabet[item&15]
	}
	return string(result)
}
