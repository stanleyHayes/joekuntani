package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const conversionEventsChangeName = "202608052250_jk014_conversion_events"

func conversionEventsChange() Change {
	collections := exactConversionEventsCollections()
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:     conversionEventsChangeName,
		Checksum: Checksum(canonical + "|creates=conversion_events"),
		Apply: func(ctx context.Context, db *mongo.Database) error {
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error {
			return schema.Verify(ctx, db, collections)
		},
	}
}

func exactConversionEventsCollections() []schema.Collection {
	stringField := schema.Field("string")
	dateField := schema.Field("date")
	boolField := schema.Field("bool")
	properties := bson.M{
		"_id":         schema.Field("objectId"),
		"public_id":   schema.PublicIDField(),
		"name":        bson.M{"bsonType": "string", "minLength": 2, "maxLength": 80},
		"properties":  bson.M{"bsonType": "object", "maxProperties": 20, "additionalProperties": bson.M{"bsonType": "string", "maxLength": 200}},
		"internal":    boolField,
		"occurred_at": dateField,
		"created_at":  dateField,
	}
	_ = stringField
	return []schema.Collection{{
		Name: "conversion_events",
		Validator: bson.M{"$jsonSchema": bson.M{
			"bsonType":             "object",
			"additionalProperties": false,
			"required":             bson.A{"_id", "public_id", "name", "properties", "internal", "occurred_at", "created_at"},
			"properties":           properties,
		}},
		Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
			{Name: "ix_conversion_name_occurred", Keys: bson.D{{Key: "name", Value: 1}, {Key: "occurred_at", Value: -1}}},
			{Name: "ix_conversion_occurred_internal", Keys: bson.D{{Key: "occurred_at", Value: -1}, {Key: "internal", Value: 1}}},
		},
	}}
}
