package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const servicesChangeName = "202608051506_jk006_services"

func servicesChange() Change {
	collection := exactServicesCollection()
	canonical, err := schema.CanonicalChecksum([]schema.Collection{collection})
	if err != nil {
		panic(err)
	}
	return Change{
		Name:     servicesChangeName,
		Checksum: canonical,
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return schema.Apply(ctx, database, []schema.Collection{collection})
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, []schema.Collection{collection})
		},
	}
}

func exactServicesCollection() schema.Collection {
	stringArray := bson.M{"bsonType": "array", "maxItems": 20, "items": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 100}}
	question := bson.M{
		"bsonType":             "object",
		"additionalProperties": false,
		"required":             bson.A{"key", "label", "type", "required"},
		"properties": bson.M{
			"key":         bson.M{"bsonType": "string", "pattern": "^[a-z][a-z0-9_]{0,63}$"},
			"label":       bson.M{"bsonType": "string", "minLength": 2, "maxLength": 160},
			"help_text":   bson.M{"bsonType": "string", "maxLength": 400},
			"placeholder": bson.M{"bsonType": "string", "maxLength": 160},
			"type":        bson.M{"bsonType": "string", "enum": bson.A{"text", "textarea", "select", "multi_select", "date", "number", "checkbox"}},
			"required":    schema.Field("bool"),
			"options":     stringArray,
		},
	}
	formSchema := bson.M{
		"bsonType":             "object",
		"additionalProperties": false,
		"required":             bson.A{"version", "questions"},
		"properties": bson.M{
			"version":   bson.M{"bsonType": schema.Field("int", "long")["bsonType"], "enum": bson.A{1}},
			"questions": bson.M{"bsonType": "array", "maxItems": 30, "items": question},
		},
	}
	cta := bson.M{
		"bsonType":             "object",
		"additionalProperties": false,
		"required":             bson.A{"label", "href"},
		"properties": bson.M{
			"label": bson.M{"bsonType": "string", "minLength": 2, "maxLength": 80},
			"href":  bson.M{"bsonType": "string", "enum": bson.A{"/book"}},
		},
	}
	return schema.Collection{
		Name: "services",
		Validator: schema.JSONSchema(
			[]string{"public_id", "name", "slug", "summary", "description", "category", "active", "sort_order", "form_schema", "cta", "created_at", "updated_at"},
			bson.M{
				"public_id":   schema.PublicIDField(),
				"name":        bson.M{"bsonType": "string", "minLength": 2, "maxLength": 120},
				"slug":        bson.M{"bsonType": "string", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$", "maxLength": 120},
				"summary":     bson.M{"bsonType": "string", "maxLength": 280},
				"description": bson.M{"bsonType": "string", "maxLength": 8000},
				"category":    bson.M{"bsonType": "string", "maxLength": 80},
				"active":      schema.Field("bool"),
				"sort_order":  bson.M{"bsonType": schema.Field("int", "long")["bsonType"], "minimum": 0, "maximum": 10000},
				"form_schema": formSchema,
				"cta":         cta,
				"created_at":  schema.Field("date"),
				"updated_at":  schema.Field("date"),
			},
		),
		Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
			{Name: "uq_service_slug", Keys: bson.D{{Key: "slug", Value: 1}}, Unique: true},
			{Name: "ix_service_active_order", Keys: bson.D{{Key: "active", Value: 1}, {Key: "sort_order", Value: 1}}},
			{Name: "ix_service_updated", Keys: bson.D{{Key: "updated_at", Value: -1}}},
		},
	}
}
