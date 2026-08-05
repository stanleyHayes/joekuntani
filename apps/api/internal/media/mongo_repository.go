package media

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoRepository struct{ database *mongo.Database }

func NewMongoRepository(database *mongo.Database) (*MongoRepository, error) {
	if database == nil {
		return nil, ErrInvalid
	}
	return &MongoRepository{database: database}, nil
}

type assetDocument struct {
	ID              bson.ObjectID `bson:"_id"`
	PublicID        string        `bson:"public_id"`
	Type            string        `bson:"type"`
	StorageKey      string        `bson:"storage_key"`
	PublicURL       string        `bson:"public_url,omitempty"`
	Filename        string        `bson:"filename"`
	MIMEType        string        `bson:"mime_type"`
	Bytes           int64         `bson:"bytes"`
	Width           int           `bson:"width,omitempty"`
	Height          int           `bson:"height,omitempty"`
	AltText         string        `bson:"alt_text,omitempty"`
	Tags            []string      `bson:"tags,omitempty"`
	Folder          string        `bson:"folder,omitempty"`
	Transformations []string      `bson:"transformations,omitempty"`
	ProviderVersion string        `bson:"provider_version,omitempty"`
	Status          Status        `bson:"status"`
	UploadedBy      bson.ObjectID `bson:"uploaded_by"`
	CreatedAt       time.Time     `bson:"created_at"`
	UpdatedAt       time.Time     `bson:"updated_at"`
}

func documentFromAsset(asset Asset) (assetDocument, error) {
	id, err := bson.ObjectIDFromHex(asset.ID)
	if err != nil {
		return assetDocument{}, ErrInvalid
	}
	actor, err := bson.ObjectIDFromHex(asset.UploadedBy)
	if err != nil {
		return assetDocument{}, ErrInvalid
	}
	kind := "document"
	if strings.HasPrefix(asset.MIMEType, "image/") {
		kind = "image"
	}
	return assetDocument{ID: id, PublicID: asset.PublicID, Type: kind, StorageKey: asset.Folder + "/" + asset.PublicID, Filename: asset.Filename, MIMEType: asset.MIMEType, Bytes: asset.Bytes, Width: asset.Width, Height: asset.Height, AltText: asset.AltText, Tags: asset.Tags, Folder: asset.Folder, Transformations: asset.Transformations, Status: asset.Status, UploadedBy: actor, CreatedAt: asset.CreatedAt, UpdatedAt: asset.UpdatedAt}, nil
}
func assetFromDocument(doc assetDocument) Asset {
	return Asset{ID: doc.ID.Hex(), PublicID: doc.PublicID, StorageKey: doc.StorageKey, Filename: doc.Filename, MIMEType: doc.MIMEType, PublicURL: doc.PublicURL, Folder: doc.Folder, AltText: doc.AltText, ProviderVersion: doc.ProviderVersion, Tags: doc.Tags, Transformations: doc.Transformations, Bytes: doc.Bytes, Width: doc.Width, Height: doc.Height, Status: doc.Status, UploadedBy: doc.UploadedBy.Hex(), CreatedAt: doc.CreatedAt, UpdatedAt: doc.UpdatedAt}
}
func (r *MongoRepository) transaction(ctx context.Context, work func(context.Context) error) error {
	session, err := r.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) { return nil, work(tx) })
	return err
}
func (r *MongoRepository) appendAudit(ctx context.Context, event AuditEvent) error {
	var actor any = nil
	if event.ActorID != "" {
		id, err := bson.ObjectIDFromHex(event.ActorID)
		if err != nil {
			return ErrInvalid
		}
		actor = id
	}
	publicID, err := newUUID()
	if err != nil {
		return err
	}
	_, err = r.database.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": publicID, "actor_id": actor, "action": event.Action, "entity_type": "media_asset", "entity_id": event.AssetID, "metadata": bson.M{"outcome": event.Outcome}, "created_at": event.CreatedAt})
	return err
}
func (r *MongoRepository) CreateDraftWithAudit(ctx context.Context, asset Asset, event AuditEvent) error {
	doc, err := documentFromAsset(asset)
	if err != nil {
		return err
	}
	return r.transaction(ctx, func(tx context.Context) error {
		if _, err := r.database.Collection("media_assets").InsertOne(tx, doc); err != nil {
			return mapMongoError(err)
		}
		return r.appendAudit(tx, event)
	})
}
func (r *MongoRepository) MarkUploading(ctx context.Context, id string, event AuditEvent) error {
	return r.updateWithAudit(ctx, id, bson.M{"$in": bson.A{StatusDraft, StatusFailed, StatusUploading}}, bson.M{"$set": bson.M{"status": StatusUploading}}, event)
}
func (r *MongoRepository) MarkFailed(ctx context.Context, id string, at time.Time, event AuditEvent) error {
	return r.updateWithAudit(ctx, id, StatusUploading, bson.M{"$set": bson.M{"status": StatusFailed, "updated_at": at}}, event)
}
func (r *MongoRepository) updateWithAudit(ctx context.Context, id string, allowedStatus any, update bson.M, event AuditEvent) error {
	return r.transaction(ctx, func(tx context.Context) error {
		result, err := r.database.Collection("media_assets").UpdateOne(tx, bson.M{"public_id": id, "status": allowedStatus}, update)
		if err != nil {
			return err
		}
		if result.MatchedCount != 1 {
			return ErrConflict
		}
		return r.appendAudit(tx, event)
	})
}
func (r *MongoRepository) Complete(ctx context.Context, c Completion, eventID string, at time.Time, event AuditEvent) (Asset, error) {
	if eventID == "" {
		return Asset{}, ErrInvalidSignature
	}
	hash := sha256.Sum256([]byte(eventID))
	eventHash := hex.EncodeToString(hash[:])
	var result Asset
	err := r.transaction(ctx, func(tx context.Context) error {
		_, insertErr := r.database.Collection("media_callback_events").InsertOne(tx, bson.M{"provider": "cloudinary", "event_hash": eventHash, "asset_id": c.AssetID, "received_at": at})
		if mongo.IsDuplicateKeyError(insertErr) {
			return ErrReplay
		}
		if insertErr != nil {
			return insertErr
		}
		filter := bson.M{"public_id": c.AssetID, "status": StatusUploading}
		update := bson.M{"$set": bson.M{"storage_key": c.StorageKey, "public_url": c.PublicURL, "mime_type": c.MIMEType, "bytes": c.Bytes, "width": c.Width, "height": c.Height, "provider_version": c.ProviderVersion, "status": StatusReady, "updated_at": at}}
		opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
		var doc assetDocument
		err := r.database.Collection("media_assets").FindOneAndUpdate(tx, filter, update, opts).Decode(&doc)
		if errors.Is(err, mongo.ErrNoDocuments) {
			current, findErr := r.Get(tx, c.AssetID)
			if findErr != nil {
				return findErr
			}
			if current.Status == StatusReady && completionMatches(current, c) {
				if err = r.appendAudit(tx, event); err != nil {
					return err
				}
				result = current
				return nil
			}
			return ErrConflict
		}
		if err != nil {
			return err
		}
		if err = r.appendAudit(tx, event); err != nil {
			return err
		}
		result = assetFromDocument(doc)
		return nil
	})
	return result, err
}
func (r *MongoRepository) Get(ctx context.Context, id string) (Asset, error) {
	var doc assetDocument
	err := r.database.Collection("media_assets").FindOne(ctx, bson.M{"public_id": id, "status": bson.M{"$ne": StatusDeleted}}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Asset{}, ErrNotFound
	}
	if err != nil {
		return Asset{}, err
	}
	return assetFromDocument(doc), nil
}
func (r *MongoRepository) List(ctx context.Context) ([]Asset, error) {
	cursor, err := r.database.Collection("media_assets").Find(ctx, bson.M{"status": bson.M{"$ne": StatusDeleted}}, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var docs []assetDocument
	if err = cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	assets := make([]Asset, len(docs))
	for i, doc := range docs {
		assets[i] = assetFromDocument(doc)
	}
	return assets, nil
}
func (r *MongoRepository) UpdateMetadata(ctx context.Context, id, alt string, tags, transforms []string, at time.Time, event AuditEvent) (Asset, error) {
	var result Asset
	err := r.transaction(ctx, func(tx context.Context) error {
		opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
		var doc assetDocument
		err := r.database.Collection("media_assets").FindOneAndUpdate(tx, bson.M{"public_id": id, "status": bson.M{"$ne": StatusDeleted}}, bson.M{"$set": bson.M{"alt_text": alt, "tags": tags, "transformations": transforms, "updated_at": at}}, opts).Decode(&doc)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if err = r.appendAudit(tx, event); err != nil {
			return err
		}
		result = assetFromDocument(doc)
		return nil
	})
	return result, err
}
func (r *MongoRepository) References(ctx context.Context, id string) ([]UsageReference, error) {
	if _, err := r.Get(ctx, id); err != nil {
		return nil, err
	}
	cursor, err := r.database.Collection("media_usage_references").Find(ctx, bson.M{"asset_id": id})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var refs []UsageReference
	if err = cursor.All(ctx, &refs); err != nil {
		return nil, err
	}
	return refs, nil
}
func (r *MongoRepository) AddReference(ctx context.Context, ref UsageReference, event AuditEvent) error {
	return r.transaction(ctx, func(tx context.Context) error {
		result, err := r.database.Collection("media_assets").UpdateOne(tx, bson.M{"public_id": ref.AssetID, "status": bson.M{"$nin": bson.A{StatusDeleted, StatusDeleting}}}, bson.M{"$inc": bson.M{"reference_version": 1}})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return ErrNotFound
		}
		_, err = r.database.Collection("media_usage_references").InsertOne(tx, ref)
		if mongo.IsDuplicateKeyError(err) {
			return nil
		}
		if err != nil {
			return err
		}
		return r.appendAudit(tx, event)
	})
}
func (r *MongoRepository) RemoveReference(ctx context.Context, ref UsageReference, event AuditEvent) error {
	return r.transaction(ctx, func(tx context.Context) error {
		result, err := r.database.Collection("media_assets").UpdateOne(tx, bson.M{"public_id": ref.AssetID, "status": bson.M{"$ne": StatusDeleted}}, bson.M{"$inc": bson.M{"reference_version": 1}})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return ErrNotFound
		}
		_, err = r.database.Collection("media_usage_references").DeleteOne(tx, bson.M{"asset_id": ref.AssetID, "entity_type": ref.EntityType, "entity_id": ref.EntityID, "field": ref.Field})
		if err != nil {
			return err
		}
		return r.appendAudit(tx, event)
	})
}
func (r *MongoRepository) Delete(ctx context.Context, id string, at time.Time, event AuditEvent) error {
	return r.transaction(ctx, func(tx context.Context) error {
		count, err := r.database.Collection("media_usage_references").CountDocuments(tx, bson.M{"asset_id": id})
		if err != nil {
			return err
		}
		if count > 0 {
			return ErrReferenced
		}
		result, err := r.database.Collection("media_assets").UpdateOne(tx, bson.M{"public_id": id, "status": StatusDeleting}, bson.M{"$set": bson.M{"status": StatusDeleted, "updated_at": at}})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			refs, refErr := r.References(tx, id)
			if refErr != nil {
				return refErr
			}
			if len(refs) > 0 {
				return ErrReferenced
			}
			return ErrConflict
		}
		return r.appendAudit(tx, event)
	})
}
func (r *MongoRepository) PrepareDelete(ctx context.Context, id string, at time.Time) error {
	return r.transaction(ctx, func(tx context.Context) error {
		count, err := r.database.Collection("media_usage_references").CountDocuments(tx, bson.M{"asset_id": id})
		if err != nil {
			return err
		}
		if count > 0 {
			return ErrReferenced
		}
		result, err := r.database.Collection("media_assets").UpdateOne(tx, bson.M{"public_id": id, "status": bson.M{"$nin": bson.A{StatusDeleted, StatusDeleting}}}, bson.M{"$set": bson.M{"status": StatusDeleting, "updated_at": at}})
		if err != nil {
			return err
		}
		if result.MatchedCount != 1 {
			return ErrConflict
		}
		return nil
	})
}
func (r *MongoRepository) RestoreDelete(ctx context.Context, id string, status Status, at time.Time, event AuditEvent) error {
	return r.transaction(ctx, func(tx context.Context) error {
		result, err := r.database.Collection("media_assets").UpdateOne(tx, bson.M{"public_id": id, "status": StatusDeleting}, bson.M{"$set": bson.M{"status": status, "updated_at": at}})
		if err != nil {
			return err
		}
		if result.MatchedCount != 1 {
			return ErrConflict
		}
		return r.appendAudit(tx, event)
	})
}
func mapMongoError(err error) error {
	if mongo.IsDuplicateKeyError(err) {
		return ErrConflict
	}
	return err
}

var _ Repository = (*MongoRepository)(nil)
