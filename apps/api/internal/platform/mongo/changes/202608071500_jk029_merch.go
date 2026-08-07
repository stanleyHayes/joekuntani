package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const merchChangeName = "202608071500_jk029_merch"

func merchChange() Change {
	collections := exactMerchCollections()
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:     merchChangeName,
		Checksum: Checksum(canonical + "|creates=merch_products,merch_variants,merch_orders"),
		Apply: func(ctx context.Context, db *mongo.Database) error {
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error {
			return schema.Verify(ctx, db, collections)
		},
	}
}

func exactMerchCollections() []schema.Collection {
	stringField := schema.Field("string")
	dateField := schema.Field("date")
	boolField := schema.Field("bool")
	intField := schema.Field("int", "long")
	decimalField := schema.Field("decimal")

	return []schema.Collection{
		{
			Name: "merch_products",
			Validator: bson.M{"$jsonSchema": bson.M{
				"bsonType":             "object",
				"additionalProperties": false,
				"required":             bson.A{"_id", "public_id", "slug", "name", "active", "sort_order", "created_at", "updated_at"},
				"properties": bson.M{
					"_id":             schema.Field("objectId"),
					"public_id":       schema.PublicIDField(),
					"slug":            stringField,
					"name":            stringField,
					"summary":         stringField,
					"description":     stringField,
					"category":        stringField,
					"image_asset_ids": bson.M{"bsonType": bson.A{"array", "null"}, "items": stringField},
					"active":          boolField,
					"sort_order":      intField,
					"created_at":      dateField,
					"updated_at":      dateField,
				},
			}},
			Indexes: []schema.Index{
				{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
				{Name: "uq_merch_product_slug", Keys: bson.D{{Key: "slug", Value: 1}}, Unique: true},
				{Name: "ix_merch_product_active_order", Keys: bson.D{{Key: "active", Value: 1}, {Key: "sort_order", Value: 1}}},
			},
		},
		{
			Name: "merch_variants",
			Validator: bson.M{"$jsonSchema": bson.M{
				"bsonType":             "object",
				"additionalProperties": false,
				"required":             bson.A{"_id", "public_id", "product_id", "label", "price", "currency", "stock", "active", "sort_order", "created_at", "updated_at"},
				"properties": bson.M{
					"_id":        schema.Field("objectId"),
					"public_id":  schema.PublicIDField(),
					"product_id": schema.PublicIDField(),
					"sku":        stringField,
					"label":      stringField,
					"price":      decimalField,
					"currency":   stringField,
					"stock":      intField,
					"active":     boolField,
					"sort_order": intField,
					"created_at": dateField,
					"updated_at": dateField,
				},
			}},
			Indexes: []schema.Index{
				{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
				{Name: "ix_merch_variant_product", Keys: bson.D{{Key: "product_id", Value: 1}, {Key: "sort_order", Value: 1}}},
			},
		},
		{
			Name: "merch_orders",
			Validator: bson.M{"$jsonSchema": bson.M{
				"bsonType":             "object",
				"additionalProperties": false,
				"required":             bson.A{"_id", "public_id", "reference", "lines", "buyer", "delivery", "currency", "total", "status", "created_at", "updated_at"},
				"properties": bson.M{
					"_id":       schema.Field("objectId"),
					"public_id": schema.PublicIDField(),
					"reference": stringField,
					"lines": bson.M{"bsonType": "array", "items": bson.M{
						"bsonType":             "object",
						"additionalProperties": false,
						"required":             bson.A{"variant_id", "quantity", "unit_price", "line_total"},
						"properties": bson.M{
							"variant_id":    stringField,
							"product_name":  stringField,
							"variant_label": stringField,
							"sku":           stringField,
							"unit_price":    decimalField,
							"quantity":      intField,
							"line_total":    decimalField,
						},
					}},
					"buyer": bson.M{
						"bsonType": "object", "additionalProperties": false,
						"required": bson.A{"name", "email"},
						"properties": bson.M{
							"name": stringField, "email": stringField, "phone": stringField,
						},
					},
					"delivery": bson.M{
						"bsonType": "object", "additionalProperties": false,
						"required": bson.A{"address", "city", "country_code"},
						"properties": bson.M{
							"address": stringField, "city": stringField, "region": stringField,
							"country_code": stringField, "notes": stringField,
						},
					},
					"currency":            stringField,
					"total":               decimalField,
					"status":              stringField,
					"fulfilment_status":   stringField,
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
				{Name: "uq_merch_order_reference", Keys: bson.D{{Key: "reference", Value: 1}}, Unique: true},
				{Name: "ix_merch_order_status_created", Keys: bson.D{{Key: "status", Value: 1}, {Key: "created_at", Value: -1}}},
			},
		},
	}
}
