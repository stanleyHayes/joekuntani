package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const supportDonationsChangeName = "202608061730_jk027_support_donations"

func supportDonationsChange() Change {
	collections := exactSupportDonationCollections()
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:     supportDonationsChangeName,
		Checksum: Checksum(canonical + "|creates=support_donations"),
		Apply: func(ctx context.Context, db *mongo.Database) error {
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error {
			return schema.Verify(ctx, db, collections)
		},
	}
}

func exactSupportDonationCollections() []schema.Collection {
	stringField := schema.Field("string")
	dateField := schema.Field("date")
	boolField := schema.Field("bool")
	return []schema.Collection{
		{
			Name: "support_donations",
			Validator: bson.M{"$jsonSchema": bson.M{
				"bsonType":             "object",
				"additionalProperties": false,
				"required":             bson.A{"_id", "public_id", "reference", "amount", "currency", "status", "created_at", "updated_at"},
				"properties": bson.M{
					"_id":                 schema.Field("objectId"),
					"public_id":           schema.PublicIDField(),
					"reference":           stringField,
					"amount":              schema.Field("decimal"),
					"currency":            stringField,
					"donor_name":          stringField,
					"donor_email":         stringField,
					"message":             stringField,
					"anonymous":           boolField,
					"status":              stringField,
					"provider":            stringField,
					"checkout_session_id": stringField,
					"checkout_url":        stringField,
					"checkout_expires_at": dateField,
					"applied_events":      bson.M{"bsonType": bson.A{"array", "null"}, "items": stringField},
					"last_webhook_hash":   stringField,
					"created_at":          dateField,
					"updated_at":          dateField,
					"paid_at":             schema.Field("date", "null"),
				},
			}},
			Indexes: []schema.Index{
				{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
				{Name: "uq_support_reference", Keys: bson.D{{Key: "reference", Value: 1}}, Unique: true},
				{Name: "ix_support_status_created", Keys: bson.D{{Key: "status", Value: 1}, {Key: "created_at", Value: -1}}},
			},
		},
	}
}
