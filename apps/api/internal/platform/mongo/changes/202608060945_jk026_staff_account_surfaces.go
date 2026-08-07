package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const staffAccountSurfacesChangeName = "202608060945_jk026_staff_account_surfaces"

func staffAccountSurfacesChange() Change {
	collections := exactStaffAccountCollections()
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:     staffAccountSurfacesChangeName,
		Checksum: Checksum(canonical + "|creates=staff_preferences,newsletter_subscribers"),
		Apply: func(ctx context.Context, db *mongo.Database) error {
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error {
			return schema.Verify(ctx, db, collections)
		},
	}
}

func exactStaffAccountCollections() []schema.Collection {
	stringField := schema.Field("string")
	dateField := schema.Field("date")
	boolField := schema.Field("bool")
	return []schema.Collection{
		{
			Name: "staff_preferences",
			Validator: bson.M{"$jsonSchema": bson.M{
				"bsonType":             "object",
				"additionalProperties": false,
				"required":             bson.A{"_id", "public_id", "user_public_id", "email_product_updates", "email_security_alerts", "dense_ui", "timezone", "created_at", "updated_at"},
				"properties": bson.M{
					"_id":                   schema.Field("objectId"),
					"public_id":             schema.PublicIDField(),
					"user_public_id":        schema.PublicIDField(),
					"email_product_updates": boolField,
					"email_security_alerts": boolField,
					"dense_ui":              boolField,
					"timezone":              stringField,
					"created_at":            dateField,
					"updated_at":            dateField,
				},
			}},
			Indexes: []schema.Index{
				{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
				{Name: "uq_staff_pref_user", Keys: bson.D{{Key: "user_public_id", Value: 1}}, Unique: true},
			},
		},
		{
			Name: "newsletter_subscribers",
			Validator: bson.M{"$jsonSchema": bson.M{
				"bsonType":             "object",
				"additionalProperties": false,
				"required":             bson.A{"_id", "public_id", "email", "source", "status", "consent_version", "consent_at", "created_at", "updated_at"},
				"properties": bson.M{
					"_id":             schema.Field("objectId"),
					"public_id":       schema.PublicIDField(),
					"email":           stringField,
					"name":            stringField,
					"source":          stringField,
					"status":          stringField,
					"consent_version": stringField,
					"consent_at":      dateField,
					"created_at":      dateField,
					"updated_at":      dateField,
					"unsubscribed_at": schema.Field("date", "null"),
				},
			}},
			Indexes: []schema.Index{
				{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
				{Name: "uq_newsletter_email", Keys: bson.D{{Key: "email", Value: 1}}, Unique: true},
				{Name: "ix_newsletter_status_created", Keys: bson.D{{Key: "status", Value: 1}, {Key: "created_at", Value: -1}}},
			},
		},
	}
}
