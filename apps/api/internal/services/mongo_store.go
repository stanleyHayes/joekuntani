package services

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ database *mongo.Database }

func NewMongoStore(database *mongo.Database) *MongoStore { return &MongoStore{database: database} }

type serviceDocument struct {
	ID          bson.ObjectID  `bson:"_id"`
	PublicID    string         `bson:"public_id"`
	Name        string         `bson:"name"`
	Slug        string         `bson:"slug"`
	Summary     string         `bson:"summary"`
	Description string         `bson:"description"`
	Category    string         `bson:"category"`
	Active      bool           `bson:"active"`
	Version     int64          `bson:"version"`
	RetiredAt   *bson.DateTime `bson:"retired_at,omitempty"`
	SortOrder   int            `bson:"sort_order"`
	FormSchema  FormSchema     `bson:"form_schema"`
	CTA         CTA            `bson:"cta"`
	CreatedAt   bson.DateTime  `bson:"created_at"`
	UpdatedAt   bson.DateTime  `bson:"updated_at"`
}

func serviceFromDocument(document serviceDocument) Service {
	result := Service{ID: document.ID.Hex(), PublicID: document.PublicID, Name: document.Name, Slug: document.Slug, Summary: document.Summary, Description: document.Description, Category: document.Category, Active: document.Active, Version: document.Version, SortOrder: document.SortOrder, FormSchema: document.FormSchema, CTA: document.CTA, CreatedAt: document.CreatedAt.Time(), UpdatedAt: document.UpdatedAt.Time()}
	if document.RetiredAt != nil {
		retiredAt := document.RetiredAt.Time()
		result.RetiredAt = &retiredAt
	}
	return result
}

func (store *MongoStore) List(ctx context.Context, activeOnly bool) ([]Service, error) {
	filter := bson.M{}
	if activeOnly {
		filter["active"] = true
		filter["retired_at"] = bson.M{"$exists": false}
	}
	cursor, err := store.database.Collection("services").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "sort_order", Value: 1}, {Key: "name", Value: 1}, {Key: "_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	result := []Service{}
	for cursor.Next(ctx) {
		var document serviceDocument
		if err := cursor.Decode(&document); err != nil {
			return nil, err
		}
		result = append(result, serviceFromDocument(document))
	}
	return result, cursor.Err()
}

func (store *MongoStore) FindBySlug(ctx context.Context, slug string) (Service, error) {
	return store.findOne(ctx, bson.M{"slug": slug})
}

func (store *MongoStore) FindByID(ctx context.Context, id string) (Service, error) {
	return store.findOne(ctx, bson.M{"public_id": id})
}

func (store *MongoStore) findOne(ctx context.Context, filter bson.M) (Service, error) {
	var document serviceDocument
	if err := store.database.Collection("services").FindOne(ctx, filter).Decode(&document); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return Service{}, ErrNotFound
		}
		return Service{}, err
	}
	return serviceFromDocument(document), nil
}

func (store *MongoStore) Create(ctx context.Context, service Service, audit AuditEvent) error {
	return store.transaction(ctx, func(transaction context.Context) error {
		_, err := store.database.Collection("services").InsertOne(transaction, serviceBSON(service, true))
		if err != nil {
			return mapMongoError(err)
		}
		return store.appendAudit(transaction, audit)
	})
}

func (store *MongoStore) Update(ctx context.Context, service Service, expectedVersion int64, audit AuditEvent) error {
	return store.transaction(ctx, func(transaction context.Context) error {
		result, err := store.database.Collection("services").UpdateOne(transaction, bson.M{"public_id": service.PublicID, "slug": service.Slug, "version": expectedVersion, "retired_at": bson.M{"$exists": false}}, bson.M{"$set": serviceBSON(service, false), "$inc": bson.M{"version": 1}})
		if err != nil {
			return mapMongoError(err)
		}
		if result.MatchedCount != 1 {
			return ErrConflict
		}
		return store.appendAudit(transaction, audit)
	})
}

func (store *MongoStore) SetActive(ctx context.Context, id string, active bool, expectedVersion int64, updatedAt time.Time, audit AuditEvent) error {
	return store.transaction(ctx, func(transaction context.Context) error {
		if err := store.requireMutableVersion(transaction, id, expectedVersion); err != nil {
			return err
		}
		result, err := store.database.Collection("services").UpdateOne(transaction, bson.M{"public_id": id, "version": expectedVersion, "retired_at": bson.M{"$exists": false}}, bson.M{"$set": bson.M{"active": active, "updated_at": updatedAt}, "$inc": bson.M{"version": 1}})
		if err != nil {
			return err
		}
		if result.MatchedCount != 1 {
			return ErrConflict
		}
		return store.appendAudit(transaction, audit)
	})
}

func (store *MongoStore) Retire(ctx context.Context, id string, expectedVersion int64, updatedAt time.Time, audit AuditEvent) (Service, error) {
	var retired Service
	err := store.transaction(ctx, func(transaction context.Context) error {
		current, err := store.findOne(transaction, bson.M{"public_id": id})
		if err != nil {
			return err
		}
		if current.RetiredAt != nil {
			retired = current
			return nil
		}
		if current.Version != expectedVersion {
			return ErrConflict
		}
		result, err := store.database.Collection("services").UpdateOne(transaction, bson.M{"public_id": id, "version": expectedVersion, "retired_at": bson.M{"$exists": false}}, bson.M{"$set": bson.M{"active": false, "retired_at": updatedAt, "updated_at": updatedAt}, "$inc": bson.M{"version": 1}})
		if err != nil {
			return err
		}
		if result.MatchedCount != 1 {
			return ErrConflict
		}
		current.Active, current.RetiredAt, current.UpdatedAt, current.Version = false, &updatedAt, updatedAt, current.Version+1
		retired = current
		return store.appendAudit(transaction, audit)
	})
	return retired, err
}

func (store *MongoStore) Reorder(ctx context.Context, items []OrderItem, updatedAt time.Time, audit AuditEvent) error {
	return store.transaction(ctx, func(transaction context.Context) error {
		count, err := store.database.Collection("services").CountDocuments(transaction, bson.M{"retired_at": bson.M{"$exists": false}})
		if err != nil {
			return err
		}
		if count != int64(len(items)) {
			return ErrConflict
		}
		for order, item := range items {
			result, err := store.database.Collection("services").UpdateOne(transaction, bson.M{"public_id": item.ID, "version": item.Version, "retired_at": bson.M{"$exists": false}}, bson.M{"$set": bson.M{"sort_order": order, "updated_at": updatedAt}, "$inc": bson.M{"version": 1}})
			if err != nil {
				return err
			}
			if result.MatchedCount != 1 {
				return ErrConflict
			}
		}
		return store.appendAudit(transaction, audit)
	})
}

func (store *MongoStore) requireMutableVersion(ctx context.Context, id string, expectedVersion int64) error {
	current, err := store.findOne(ctx, bson.M{"public_id": id})
	if err != nil {
		return err
	}
	if current.RetiredAt != nil || current.Version != expectedVersion {
		return ErrConflict
	}
	return nil
}

func (store *MongoStore) transaction(ctx context.Context, action func(context.Context) error) error {
	session, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(transaction context.Context) (any, error) { return nil, action(transaction) })
	return err
}

func (store *MongoStore) appendAudit(ctx context.Context, event AuditEvent) error {
	actor, err := bson.ObjectIDFromHex(event.ActorID)
	if err != nil {
		return ErrForbidden
	}
	_, err = store.database.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": event.PublicID, "actor_id": actor, "action": event.Action, "entity_type": "service", "entity_id": event.EntityID, "metadata": bson.M{}, "created_at": event.CreatedAt})
	return err
}

func serviceBSON(service Service, includeIdentity bool) bson.M {
	document := bson.M{"name": service.Name, "summary": service.Summary, "description": service.Description, "category": service.Category, "active": service.Active, "sort_order": service.SortOrder, "form_schema": service.FormSchema, "cta": service.CTA, "updated_at": service.UpdatedAt}
	if includeIdentity {
		document["public_id"], document["slug"], document["created_at"], document["version"] = service.PublicID, service.Slug, service.CreatedAt, service.Version
	}
	return document
}

func mapMongoError(err error) error {
	if mongo.IsDuplicateKeyError(err) {
		return ErrConflict
	}
	return err
}
