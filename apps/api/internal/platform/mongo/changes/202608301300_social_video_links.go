package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const socialVideoLinksChangeName = "202608301300_social_video_links"

func socialVideoLinksChange() Change {
	collections := socialVideoLinkCollections()
	checksum, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:               socialVideoLinksChangeName,
		Checksum:           checksum,
		Supersedes:         []string{videoInfrastructureChangeName, videoAspectRatioChangeName},
		EvolvesCollections: []string{"video_assets"},
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return schema.Apply(ctx, database, collections)
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, collections)
		},
	}
}

func socialVideoLinkCollections() []schema.Collection {
	stringField, dateField, boolField, intField := schema.Field("string"), schema.Field("date"), schema.Field("bool"), schema.Field("int", "long")
	properties := bson.M{
		"public_id": schema.PublicIDField(), "slug": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 180}, "title": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 180}, "description": bson.M{"bsonType": "string", "maxLength": 5000}, "category": bson.M{"bsonType": "string", "maxLength": 100}, "tags": bson.M{"bsonType": "array", "maxItems": 20, "items": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 60}},
		"provider": bson.M{"bsonType": "string", "enum": bson.A{"bunny", "cloudinary", "external"}}, "platform": bson.M{"bsonType": "string", "enum": bson.A{"", "youtube", "instagram", "tiktok", "facebook", "vimeo"}}, "source_url": stringField, "provider_video_id": stringField, "provider_library_id": stringField, "thumbnail_url": stringField, "duration_seconds": intField,
		"width": bson.M{"bsonType": bson.A{"int", "long"}, "minimum": 0, "maximum": 100000}, "height": bson.M{"bsonType": bson.A{"int", "long"}, "minimum": 0, "maximum": 100000}, "aspect_ratio": bson.M{"bsonType": "string", "pattern": "^$|^[1-9][0-9]{0,4}:[1-9][0-9]{0,4}$"},
		"status": bson.M{"bsonType": "string", "enum": bson.A{"uploading", "processing", "ready", "failed", "archived", "deleted"}}, "visibility": bson.M{"bsonType": "string", "enum": bson.A{"public", "private", "unlisted"}}, "is_published": boolField, "published_at": schema.Field("date", "null"), "sort_order": intField,
		"filename": stringField, "mime_type": stringField, "bytes": schema.Field("int", "long"), "failure_reason": stringField, "revision": bson.M{"bsonType": bson.A{"int", "long"}, "minimum": 1}, "created_by": schema.Field("objectId"), "created_at": dateField, "updated_at": dateField,
	}
	idx := func(name string, unique bool, keys ...string) schema.Index {
		document := make(bson.D, 0, len(keys))
		for _, key := range keys {
			document = append(document, bson.E{Key: key, Value: 1})
		}
		return schema.Index{Name: name, Keys: document, Unique: unique}
	}
	return []schema.Collection{{Name: "video_assets", Validator: schema.JSONSchema(
		[]string{"public_id", "slug", "title", "description", "category", "tags", "provider", "provider_video_id", "provider_library_id", "thumbnail_url", "duration_seconds", "status", "visibility", "is_published", "sort_order", "filename", "mime_type", "bytes", "failure_reason", "revision", "created_by", "created_at", "updated_at"}, properties), Indexes: []schema.Index{
		idx("uq_public_id", true, "public_id"), idx("uq_video_asset_slug", true, "slug"), idx("uq_video_provider_id", true, "provider", "provider_video_id"), idx("ix_video_public_order", false, "is_published", "visibility", "status", "sort_order"), idx("ix_video_status_created", false, "status", "created_at"), idx("ix_video_platform_public", false, "platform", "is_published", "sort_order"),
	}}}
}
