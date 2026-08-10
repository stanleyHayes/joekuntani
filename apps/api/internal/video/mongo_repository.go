package video

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type MongoRepository struct{ database *mongo.Database }

func NewMongoRepository(database *mongo.Database) *MongoRepository {
	return &MongoRepository{database: database}
}

type videoDocument struct {
	ID                bson.ObjectID `bson:"_id,omitempty"`
	PublicID          string        `bson:"public_id"`
	Slug              string        `bson:"slug"`
	Title             string        `bson:"title"`
	Description       string        `bson:"description"`
	Category          string        `bson:"category"`
	Tags              []string      `bson:"tags"`
	Provider          string        `bson:"provider"`
	ProviderVideoID   string        `bson:"provider_video_id"`
	ProviderLibraryID string        `bson:"provider_library_id"`
	ThumbnailURL      string        `bson:"thumbnail_url"`
	DurationSeconds   int           `bson:"duration_seconds"`
	Status            Status        `bson:"status"`
	Visibility        Visibility    `bson:"visibility"`
	Published         bool          `bson:"is_published"`
	PublishedAt       *time.Time    `bson:"published_at"`
	SortOrder         int           `bson:"sort_order"`
	Filename          string        `bson:"filename"`
	MIMEType          string        `bson:"mime_type"`
	Bytes             int64         `bson:"bytes"`
	FailureReason     string        `bson:"failure_reason"`
	Revision          int64         `bson:"revision"`
	CreatedBy         bson.ObjectID `bson:"created_by"`
	CreatedAt         time.Time     `bson:"created_at"`
	UpdatedAt         time.Time     `bson:"updated_at"`
}

func documentFrom(item Item) (videoDocument, error) {
	createdBy, err := bson.ObjectIDFromHex(item.CreatedBy)
	if err != nil {
		return videoDocument{}, ErrInvalid
	}
	return videoDocument{PublicID: item.PublicID, Slug: item.Slug, Title: item.Title, Description: item.Description, Category: item.Category, Tags: item.Tags, Provider: item.Provider, ProviderVideoID: item.ProviderVideoID, ProviderLibraryID: item.ProviderLibraryID, ThumbnailURL: item.ThumbnailURL, DurationSeconds: item.DurationSeconds, Status: item.Status, Visibility: item.Visibility, Published: item.Published, PublishedAt: item.PublishedAt, SortOrder: item.SortOrder, Filename: item.Filename, MIMEType: item.MIMEType, Bytes: item.Bytes, FailureReason: item.FailureReason, Revision: item.Revision, CreatedBy: createdBy, CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt}, nil
}
func (document videoDocument) item() Item {
	return Item{ID: document.ID.Hex(), PublicID: document.PublicID, Slug: document.Slug, Title: document.Title, Description: document.Description, Category: document.Category, Tags: emptyStrings(document.Tags), Provider: document.Provider, ProviderVideoID: document.ProviderVideoID, ProviderLibraryID: document.ProviderLibraryID, ThumbnailURL: document.ThumbnailURL, DurationSeconds: document.DurationSeconds, Status: document.Status, Visibility: document.Visibility, Published: document.Published, PublishedAt: document.PublishedAt, SortOrder: document.SortOrder, Filename: document.Filename, MIMEType: document.MIMEType, Bytes: document.Bytes, FailureReason: document.FailureReason, Revision: document.Revision, CreatedBy: document.CreatedBy.Hex(), CreatedAt: document.CreatedAt, UpdatedAt: document.UpdatedAt}
}

func (repository *MongoRepository) Create(ctx context.Context, item Item) error {
	document, err := documentFrom(item)
	if err != nil {
		return err
	}
	_, err = repository.database.Collection("video_assets").InsertOne(ctx, document)
	return mapMongoError(err)
}
func (repository *MongoRepository) Get(ctx context.Context, publicID string) (Item, error) {
	var document videoDocument
	err := repository.database.Collection("video_assets").FindOne(ctx, bson.M{"public_id": publicID}).Decode(&document)
	if err != nil {
		return Item{}, mapMongoError(err)
	}
	return document.item(), nil
}
func (repository *MongoRepository) GetByProviderID(ctx context.Context, provider, providerID string) (Item, error) {
	var document videoDocument
	err := repository.database.Collection("video_assets").FindOne(ctx, bson.M{"provider": provider, "provider_video_id": providerID}).Decode(&document)
	if err != nil {
		return Item{}, mapMongoError(err)
	}
	return document.item(), nil
}
func (repository *MongoRepository) List(ctx context.Context, publicOnly bool) ([]Item, error) {
	filter := bson.M{"status": bson.M{"$ne": StatusDeleted}}
	if publicOnly {
		filter["is_published"] = true
	}
	cursor, err := repository.database.Collection("video_assets").Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var documents []videoDocument
	if err = cursor.All(ctx, &documents); err != nil {
		return nil, err
	}
	items := make([]Item, len(documents))
	for i, d := range documents {
		items[i] = d.item()
	}
	return items, nil
}
func (repository *MongoRepository) Update(ctx context.Context, item Item, revision int64) (Item, error) {
	document, err := documentFrom(item)
	if err != nil {
		return Item{}, err
	}
	document.Revision = revision + 1
	result, err := repository.database.Collection("video_assets").ReplaceOne(ctx, bson.M{"public_id": item.PublicID, "revision": revision}, document)
	if err != nil {
		return Item{}, mapMongoError(err)
	}
	if result.MatchedCount != 1 {
		return Item{}, ErrConflict
	}
	return document.item(), nil
}
func (repository *MongoRepository) RecordWebhook(ctx context.Context, key, provider string, payload []byte) (bool, error) {
	digest := bson.Binary{Subtype: 0, Data: append([]byte{}, payload...)}
	_, err := repository.database.Collection("video_webhooks").InsertOne(ctx, bson.M{"event_key": key, "provider": provider, "payload": digest, "created_at": time.Now().UTC()})
	if mongo.IsDuplicateKeyError(err) {
		return false, nil
	}
	return err == nil, err
}
func mapMongoError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	if mongo.IsDuplicateKeyError(err) {
		return ErrConflict
	}
	return err
}
func emptyStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}
