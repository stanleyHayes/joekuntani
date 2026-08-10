package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const videoInfrastructureChangeName = "202608100100_vid001_video_infrastructure"

func videoInfrastructureChange() Change {
	collections := videoInfrastructureCollections()
	evolvesCollections := []string{"pages", "portfolio_items", "videos", "press_items", "testimonials", "video_assets", "video_webhooks"}
	checksum, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: videoInfrastructureChangeName, Checksum: Checksum(checksum + "|supersedes=" + contentSectionsChangeName + "|evolves=" + strings.Join(evolvesCollections, ",")), Supersedes: []string{contentSectionsChangeName}, EvolvesCollections: evolvesCollections, Apply: func(ctx context.Context, database *mongo.Database) error {
		return schema.Apply(ctx, database, collections)
	}, Verify: func(ctx context.Context, database *mongo.Database) error {
		return schema.Verify(ctx, database, collections)
	}}
}

func videoInfrastructureCollections() []schema.Collection {
	stringField, dateField, boolField, intField := schema.Field("string"), schema.Field("date"), schema.Field("bool"), schema.Field("int", "long")
	idx := func(name string, unique bool, keys ...string) schema.Index {
		document := make(bson.D, 0, len(keys))
		for _, key := range keys {
			document = append(document, bson.E{Key: key, Value: 1})
		}
		return schema.Index{Name: name, Keys: document, Unique: unique}
	}
	videoProperties := bson.M{
		"public_id": schema.PublicIDField(), "slug": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 180}, "title": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 180}, "description": bson.M{"bsonType": "string", "maxLength": 5000}, "category": bson.M{"bsonType": "string", "maxLength": 100}, "tags": bson.M{"bsonType": "array", "maxItems": 20, "items": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 60}},
		"provider": bson.M{"bsonType": "string", "enum": bson.A{"bunny", "cloudinary", "external"}}, "provider_video_id": stringField, "provider_library_id": stringField, "thumbnail_url": stringField, "duration_seconds": intField,
		"status": bson.M{"bsonType": "string", "enum": bson.A{"uploading", "processing", "ready", "failed", "archived", "deleted"}}, "visibility": bson.M{"bsonType": "string", "enum": bson.A{"public", "private", "unlisted"}}, "is_published": boolField, "published_at": schema.Field("date", "null"), "sort_order": intField,
		"filename": stringField, "mime_type": stringField, "bytes": schema.Field("int", "long"), "failure_reason": stringField, "revision": bson.M{"bsonType": bson.A{"int", "long"}, "minimum": 1}, "created_by": schema.Field("objectId"), "created_at": dateField, "updated_at": dateField,
	}
	collections := exactContentSectionCollections()
	for index := range collections {
		if collections[index].Name != "videos" && collections[index].Name != "press_items" {
			continue
		}
		validator := collections[index].Validator["$jsonSchema"].(bson.M)
		validator["properties"].(bson.M)["video_asset_id"] = schema.PublicIDField()
	}
	return append(collections,
		schema.Collection{Name: "video_assets", Validator: schema.JSONSchema([]string{"public_id", "slug", "title", "description", "category", "tags", "provider", "provider_video_id", "provider_library_id", "thumbnail_url", "duration_seconds", "status", "visibility", "is_published", "sort_order", "filename", "mime_type", "bytes", "failure_reason", "revision", "created_by", "created_at", "updated_at"}, videoProperties), Indexes: []schema.Index{idx("uq_public_id", true, "public_id"), idx("uq_video_asset_slug", true, "slug"), idx("uq_video_provider_id", true, "provider", "provider_video_id"), idx("ix_video_public_order", false, "is_published", "visibility", "status", "sort_order"), idx("ix_video_status_created", false, "status", "created_at")}},
		schema.Collection{Name: "video_webhooks", Validator: schema.JSONSchema([]string{"event_key", "provider", "payload", "created_at"}, bson.M{"event_key": stringField, "provider": stringField, "payload": schema.Field("binData"), "created_at": dateField}), Indexes: []schema.Index{idx("uq_video_webhook_event", true, "event_key"), idx("ix_video_webhook_created", false, "created_at")}},
	)
}
