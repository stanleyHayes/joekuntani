package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const videoCategoriesChangeName = "202608111845_video_categories"

func videoCategoriesChange() Change {
	collections := videoCategoryCollections()
	checksum, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name: videoCategoriesChangeName, Checksum: checksum,
		EvolvesCollections: []string{"video_categories"},
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return schema.Apply(ctx, database, collections)
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, collections)
		},
	}
}

func videoCategoryCollections() []schema.Collection {
	return []schema.Collection{{
		Name: "video_categories",
		Validator: schema.JSONSchema(
			[]string{"public_id", "slug", "title", "description", "image_asset_id", "active", "sort_order", "revision", "created_by", "created_at", "updated_at"},
			bson.M{
				"public_id":      schema.PublicIDField(),
				"slug":           bson.M{"bsonType": "string", "minLength": 1, "maxLength": 100, "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$"},
				"title":          bson.M{"bsonType": "string", "minLength": 1, "maxLength": 100},
				"description":    bson.M{"bsonType": "string", "maxLength": 500},
				"image_asset_id": bson.M{"bsonType": "string", "maxLength": 100},
				"active":         schema.Field("bool"),
				"sort_order":     schema.Field("int", "long"),
				"revision":       bson.M{"bsonType": bson.A{"int", "long"}, "minimum": 1},
				"created_by":     schema.Field("objectId"),
				"created_at":     schema.Field("date"),
				"updated_at":     schema.Field("date"),
			},
		),
		Indexes: []schema.Index{
			{Name: "uq_video_category_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
			{Name: "uq_video_category_slug", Keys: bson.D{{Key: "slug", Value: 1}}, Unique: true},
			{Name: "ix_video_category_active_order", Keys: bson.D{{Key: "active", Value: 1}, {Key: "sort_order", Value: 1}, {Key: "title", Value: 1}}},
		},
	}}
}
