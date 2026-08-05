package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const siteSettingsChangeName = "202608051430_jk005_global_settings"

func siteSettingsChange() Change {
	collection := schema.Collection{
		Name: "global_settings",
		Validator: schema.JSONSchema(
			[]string{"key", "version", "draft", "content_complete", "updated_by", "updated_at"},
			bson.M{
				"key": schema.Field("string"), "version": schema.Field("int", "long"),
				"draft": schema.Field("object"), "published": schema.Field("object", "null"),
				"content_complete": schema.Field("bool"), "updated_by": schema.Field("objectId"),
				"updated_at": schema.Field("date"), "published_at": schema.Field("date", "null"),
			},
		),
		Indexes: []schema.Index{
			{Name: "uq_setting_key", Keys: bson.D{{Key: "key", Value: 1}}, Unique: true},
			{Name: "ix_setting_updated", Keys: bson.D{{Key: "updated_at", Value: -1}}},
		},
	}
	checksum, err := schema.CanonicalChecksum([]schema.Collection{collection})
	if err != nil {
		panic(err)
	}
	return Change{Name: siteSettingsChangeName, Checksum: checksum,
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return schema.Apply(ctx, database, []schema.Collection{collection})
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, []schema.Collection{collection})
		},
	}
}
