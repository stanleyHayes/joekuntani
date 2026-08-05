package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const exactMediaAssetsChangeName = "202608051500_jk008_exact_media_assets"

func exactMediaAssetsChange() Change {
	collection := exactMediaAssetsCollection()
	collections := append([]schema.Collection{collection}, mediaAssetCollections()...)
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:       exactMediaAssetsChangeName,
		Checksum:   Checksum(canonical + "|supersedes=" + mediaAssetsChangeName),
		Supersedes: []string{mediaAssetsChangeName},
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return schema.Apply(ctx, database, collections)
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, collections)
		},
	}
}

func exactMediaAssetsCollection() schema.Collection {
	stringArray := bson.M{"bsonType": "array", "items": schema.Field("string")}
	return schema.Collection{
		Name: "media_assets",
		Validator: schema.JSONSchema(
			[]string{"public_id", "type", "storage_key", "filename", "mime_type", "bytes", "status", "uploaded_by", "created_at", "updated_at"},
			bson.M{
				"public_id":        schema.PublicIDField(),
				"type":             bson.M{"bsonType": "string", "enum": bson.A{"image", "document"}},
				"storage_key":      schema.Field("string"),
				"public_url":       schema.Field("string"),
				"filename":         schema.Field("string"),
				"mime_type":        schema.Field("string"),
				"bytes":            schema.Field("int", "long"),
				"width":            schema.Field("int", "long"),
				"height":           schema.Field("int", "long"),
				"alt_text":         schema.Field("string"),
				"tags":             stringArray,
				"folder":           schema.Field("string"),
				"transformations":  stringArray,
				"provider_version": schema.Field("string"),
				"status": bson.M{"bsonType": "string", "enum": bson.A{
					"draft", "uploading", "ready", "failed", "deleting", "deleted",
				}},
				"uploaded_by":       schema.Field("objectId"),
				"created_at":        schema.Field("date"),
				"updated_at":        schema.Field("date"),
				"reference_version": schema.Field("int", "long"),
			},
		),
		Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
			{Name: "uq_media_storage_key", Keys: bson.D{{Key: "storage_key", Value: 1}}, Unique: true},
			{Name: "ix_media_type_created", Keys: bson.D{{Key: "type", Value: 1}, {Key: "created_at", Value: 1}}},
			{Name: "ix_media_status_updated", Keys: bson.D{{Key: "status", Value: 1}, {Key: "updated_at", Value: -1}}},
			{Name: "ix_media_folder_status_created", Keys: bson.D{{Key: "folder", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: -1}}},
		},
	}
}
