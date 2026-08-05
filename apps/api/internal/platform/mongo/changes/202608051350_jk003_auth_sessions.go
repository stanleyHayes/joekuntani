package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const authSessionsChangeName = "202608051350_jk003_auth_sessions"

func authSessionsChange() Change {
	zeroSeconds := int32(0)
	collections := []schema.Collection{
		{
			Name: "auth_sessions",
			Validator: schema.JSONSchema(
				[]string{"public_id", "user_id", "token_hash", "csrf_hash", "mfa_verified", "user_version", "expires_at", "last_rotated_at", "created_at"},
				bson.M{
					"public_id":       schema.PublicIDField(),
					"user_id":         schema.Field("objectId"),
					"token_hash":      schema.Field("string"),
					"csrf_hash":       schema.Field("string"),
					"mfa_verified":    schema.Field("bool"),
					"user_version":    schema.Field("date"),
					"expires_at":      schema.Field("date"),
					"last_rotated_at": schema.Field("date"),
					"revoked_at":      schema.Field("date", "null"),
					"created_at":      schema.Field("date"),
				},
			),
			Indexes: []schema.Index{
				{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
				{Name: "uq_auth_session_token_hash", Keys: bson.D{{Key: "token_hash", Value: 1}}, Unique: true},
				{Name: "ix_auth_session_user_active", Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "revoked_at", Value: 1}, {Key: "expires_at", Value: 1}}},
				{Name: "ttl_auth_session_expiry", Keys: bson.D{{Key: "expires_at", Value: 1}}, ExpireAfterSeconds: &zeroSeconds},
			},
		},
	}
	checksum, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: authSessionsChangeName, Checksum: checksum,
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return schema.Apply(ctx, database, collections)
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, collections)
		},
	}
}
