package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const privacyHoldsChangeName = "202608052310_priv001_privacy_holds"

func privacyHoldsChange() Change {
	collections := exactPrivacyHoldsCollections()
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:     privacyHoldsChangeName,
		Checksum: Checksum(canonical + "|creates=privacy_holds"),
		Apply: func(ctx context.Context, db *mongo.Database) error {
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error {
			return schema.Verify(ctx, db, collections)
		},
	}
}

func exactPrivacyHoldsCollections() []schema.Collection {
	dateField := schema.Field("date")
	properties := bson.M{
		"_id":        schema.Field("objectId"),
		"public_id":  schema.PublicIDField(),
		"contact_id": schema.PublicIDField(),
		"reason":     bson.M{"bsonType": "string", "minLength": 8, "maxLength": 500},
		"created_at": dateField,
		"cleared_at": schema.Field("date", "null"),
	}
	return []schema.Collection{{
		Name: "privacy_holds",
		Validator: bson.M{"$jsonSchema": bson.M{
			"bsonType":             "object",
			"additionalProperties": false,
			"required":             bson.A{"_id", "public_id", "contact_id", "reason", "created_at"},
			"properties":           properties,
		}},
		Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
			// MongoDB partial indexes reject $exists:false (rewritten as unsupported $not).
			// Equality to null matches missing or null cleared_at — i.e. still-active holds.
			{Name: "uq_active_contact_hold", Keys: bson.D{{Key: "contact_id", Value: 1}}, Unique: true, Partial: bson.D{{Key: "cleared_at", Value: nil}}},
			{Name: "ix_privacy_hold_created", Keys: bson.D{{Key: "created_at", Value: -1}}},
		},
	}}
}
