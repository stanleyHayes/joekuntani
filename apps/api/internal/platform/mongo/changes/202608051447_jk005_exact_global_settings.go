package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/settingsschema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const exactGlobalSettingsChangeName = "202608051447_jk005_exact_global_settings"

func exactGlobalSettingsChange() Change {
	collection := schema.Collection{Name: "global_settings", Validator: settingsschema.CollectionValidator(), Indexes: []schema.Index{
		{Name: "uq_setting_key", Keys: bson.D{{Key: "key", Value: 1}}, Unique: true},
		{Name: "ix_setting_updated", Keys: bson.D{{Key: "updated_at", Value: -1}}},
	}}
	canonical, err := schema.CanonicalChecksum([]schema.Collection{collection})
	if err != nil {
		panic(err)
	}
	return Change{Name: exactGlobalSettingsChangeName, Checksum: Checksum(canonical + "|supersedes=" + siteSettingsChangeName), Supersedes: []string{siteSettingsChangeName},
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return schema.Apply(ctx, database, []schema.Collection{collection})
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, []schema.Collection{collection})
		},
	}
}
