package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const mediaAssetsChangeName = "202608051433_jk008_media_assets"

func mediaAssetsChange() Change {
	collections := mediaAssetCollections()
	checksum, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: mediaAssetsChangeName, Checksum: checksum, Apply: func(ctx context.Context, database *mongo.Database) error {
		return schema.Apply(ctx, database, collections)
	}, Verify: func(ctx context.Context, database *mongo.Database) error {
		return schema.Verify(ctx, database, collections)
	}}
}
func mediaAssetCollections() []schema.Collection {
	return []schema.Collection{
		{Name: "media_usage_references", Validator: schema.JSONSchema([]string{"asset_id", "entity_type", "entity_id", "field", "created_at"}, bson.M{"asset_id": schema.PublicIDField(), "entity_type": schema.Field("string"), "entity_id": schema.Field("string"), "field": schema.Field("string"), "created_at": schema.Field("date")}), Indexes: []schema.Index{{Name: "uq_media_usage_reference", Keys: bson.D{{Key: "asset_id", Value: 1}, {Key: "entity_type", Value: 1}, {Key: "entity_id", Value: 1}, {Key: "field", Value: 1}}, Unique: true}, {Name: "ix_media_usage_entity", Keys: bson.D{{Key: "entity_type", Value: 1}, {Key: "entity_id", Value: 1}}}}},
		{Name: "media_callback_events", Validator: schema.JSONSchema([]string{"provider", "event_hash", "asset_id", "received_at"}, bson.M{"provider": schema.Field("string"), "event_hash": schema.Field("string"), "asset_id": schema.PublicIDField(), "received_at": schema.Field("date")}), Indexes: []schema.Index{{Name: "uq_media_provider_event", Keys: bson.D{{Key: "provider", Value: 1}, {Key: "event_hash", Value: 1}}, Unique: true}, {Name: "ix_media_callback_asset", Keys: bson.D{{Key: "asset_id", Value: 1}, {Key: "received_at", Value: -1}}}}},
	}
}
