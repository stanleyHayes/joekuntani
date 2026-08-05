package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const contentChangeName = "202608051519_jk007_content"

func contentChange() Change {
	collections := exactContentCollections()
	evolvesCollections := []string{"pages", "portfolio_items", "videos", "press_items", "testimonials"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: contentChangeName, Checksum: Checksum(canonical + "|evolves=" + strings.Join(evolvesCollections, ",")), EvolvesCollections: evolvesCollections,
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return schema.Apply(ctx, database, collections)
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, collections)
		},
	}
}

func exactContentCollections() []schema.Collection {
	stringField := func(max int) bson.M { return bson.M{"bsonType": "string", "maxLength": max} }
	requiredString := func(max int) bson.M { return bson.M{"bsonType": "string", "minLength": 1, "maxLength": max} }
	stringArray := func(maxItems, maxLength int) bson.M {
		return bson.M{"bsonType": "array", "maxItems": maxItems, "items": requiredString(maxLength)}
	}
	result := bson.M{"bsonType": "object", "additionalProperties": false, "required": bson.A{"label", "value"}, "properties": bson.M{"label": requiredString(80), "value": requiredString(160)}}
	optionalPublicID := bson.M{"bsonType": "string", "pattern": `^$|^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`}
	seo := bson.M{"bsonType": "object", "additionalProperties": false, "required": bson.A{"title", "description", "canonical_url", "social_image_asset_id"}, "properties": bson.M{"title": stringField(70), "description": stringField(180), "canonical_url": bson.M{"bsonType": "string", "maxLength": 2048, "pattern": `^$|^https://`}, "social_image_asset_id": optionalPublicID}}
	commonRequired := []string{"public_id", "title", "summary", "tags", "featured", "gallery_asset_ids", "seo", "status", "approved", "publish_at", "unpublish_at", "published_at", "created_at", "updated_at"}
	common := func() bson.M {
		return bson.M{"public_id": schema.PublicIDField(), "title": requiredString(160), "summary": stringField(500), "tags": stringArray(20, 120), "featured": schema.Field("bool"), "gallery_asset_ids": bson.M{"bsonType": "array", "maxItems": 30, "items": schema.PublicIDField()}, "seo": seo, "status": bson.M{"bsonType": "string", "enum": bson.A{"draft", "scheduled", "published", "unpublished"}}, "approved": schema.Field("bool"), "publish_at": schema.Field("date", "null"), "unpublish_at": schema.Field("date", "null"), "published_at": schema.Field("date", "null"), "created_at": schema.Field("date"), "updated_at": schema.Field("date")}
	}
	collection := func(name string, required []string, properties bson.M, indexes []schema.Index) schema.Collection {
		fields := merge(common(), properties)
		fields["_id"] = schema.Field("objectId")
		requiredFields := append([]string{"_id"}, append(append([]string{}, commonRequired...), required...)...)
		validator := bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": requiredFields, "properties": fields, "additionalProperties": false}}
		return schema.Collection{Name: name, Validator: validator, Indexes: indexes}
	}
	publicIndexes := func(identityIndex *schema.Index, extras ...schema.Index) []schema.Index {
		indexes := []schema.Index{{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true}}
		if identityIndex != nil {
			indexes = append(indexes, *identityIndex)
		}
		indexes = append(indexes, schema.Index{Name: "ix_content_publication", Keys: bson.D{{Key: "approved", Value: 1}, {Key: "status", Value: 1}, {Key: "publish_at", Value: -1}, {Key: "unpublish_at", Value: 1}}})
		return append(indexes, extras...)
	}
	return []schema.Collection{
		collection("pages", []string{"slug", "body"}, bson.M{"slug": bson.M{"bsonType": "string", "pattern": `^[a-z0-9]+(?:-[a-z0-9]+)*$`, "maxLength": 120}, "body": stringField(30000)}, publicIndexes(&schema.Index{Name: "uq_page_slug", Keys: bson.D{{Key: "slug", Value: 1}}, Unique: true})),
		collection("portfolio_items", []string{"slug", "body", "category", "results"}, bson.M{"slug": bson.M{"bsonType": "string", "pattern": `^[a-z0-9]+(?:-[a-z0-9]+)*$`, "maxLength": 120}, "body": stringField(30000), "category": requiredString(80), "results": bson.M{"bsonType": "array", "maxItems": 20, "items": result}}, publicIndexes(&schema.Index{Name: "uq_portfolio_slug", Keys: bson.D{{Key: "slug", Value: 1}}, Unique: true}, schema.Index{Name: "ix_content_category_featured", Keys: bson.D{{Key: "category", Value: 1}, {Key: "featured", Value: -1}, {Key: "publish_at", Value: -1}}}, schema.Index{Name: "ix_content_tags", Keys: bson.D{{Key: "tags", Value: 1}}})),
		collection("videos", []string{"body", "category", "external_url", "embed_url"}, bson.M{"body": stringField(30000), "category": stringField(80), "external_url": bson.M{"bsonType": "string", "pattern": `^https://`, "maxLength": 2048}, "embed_url": bson.M{"bsonType": "string", "pattern": `^https://`, "maxLength": 2048}}, publicIndexes(&schema.Index{Name: "uq_video_external_url", Keys: bson.D{{Key: "external_url", Value: 1}}, Unique: true}, schema.Index{Name: "ix_content_category_featured", Keys: bson.D{{Key: "category", Value: 1}, {Key: "featured", Value: -1}, {Key: "publish_at", Value: -1}}}, schema.Index{Name: "ix_content_tags", Keys: bson.D{{Key: "tags", Value: 1}}})),
		collection("press_items", []string{"body", "category", "external_url", "outlet"}, bson.M{"body": stringField(30000), "category": stringField(80), "external_url": bson.M{"bsonType": "string", "pattern": `^https://`, "maxLength": 2048}, "outlet": requiredString(120)}, publicIndexes(&schema.Index{Name: "uq_press_external_url", Keys: bson.D{{Key: "external_url", Value: 1}}, Unique: true}, schema.Index{Name: "ix_content_outlet_featured", Keys: bson.D{{Key: "outlet", Value: 1}, {Key: "featured", Value: -1}, {Key: "publish_at", Value: -1}}}, schema.Index{Name: "ix_content_tags", Keys: bson.D{{Key: "tags", Value: 1}}})),
		collection("testimonials", []string{"body", "person_name", "person_title", "organization"}, bson.M{"body": stringField(30000), "person_name": requiredString(120), "person_title": stringField(120), "organization": stringField(160)}, publicIndexes(nil, schema.Index{Name: "ix_content_featured", Keys: bson.D{{Key: "featured", Value: -1}, {Key: "publish_at", Value: -1}}}, schema.Index{Name: "ix_content_tags", Keys: bson.D{{Key: "tags", Value: 1}}})),
	}
}

func merge(left, right bson.M) bson.M {
	result := bson.M{}
	for key, value := range left {
		result[key] = value
	}
	for key, value := range right {
		result[key] = value
	}
	return result
}
