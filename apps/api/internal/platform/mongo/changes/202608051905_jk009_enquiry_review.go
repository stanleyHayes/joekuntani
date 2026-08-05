package changes

import (
	"context"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"strings"
)

const enquiryReviewChangeName = "202608051905_jk009_enquiry_review"

func enquiryReviewChange() Change {
	collections := exactEnquiryReviewCollections()
	evolves := []string{"enquiries", "enquiry_idempotency", "notification_outbox"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: enquiryReviewChangeName, Checksum: Checksum(canonical + "|evolves=" + strings.Join(evolves, ",")), Supersedes: []string{enquiriesOutboxChangeName}, EvolvesCollections: evolves, Apply: func(ctx context.Context, db *mongo.Database) error { return schema.Apply(ctx, db, collections) }, Verify: func(ctx context.Context, db *mongo.Database) error { return schema.Verify(ctx, db, collections) }}
}
func exactEnquiryReviewCollections() []schema.Collection {
	collections := exactEnquiryCollections()
	enquiry := collections[0].Validator["$jsonSchema"].(bson.M)
	required := enquiry["required"].(bson.A)
	required = append(required, "enquiry_type", "source", "details", "currency", "decision_deadline", "additional_notes", "marketing_consent")
	enquiry["required"] = required
	properties := enquiry["properties"].(bson.M)
	properties["enquiry_type"] = bson.M{"bsonType": "string", "enum": bson.A{"event", "brand"}}
	properties["source"] = bson.M{"bsonType": "string", "enum": bson.A{"search", "social", "referral", "press", "other"}}
	properties["currency"] = bson.M{"bsonType": "string", "enum": bson.A{"GHS", "USD", "EUR", "GBP"}}
	properties["decision_deadline"] = bson.M{"bsonType": "string", "pattern": `^[0-9]{4}-[0-9]{2}-[0-9]{2}$`}
	properties["additional_notes"] = bson.M{"bsonType": "string", "maxLength": 8000}
	properties["marketing_consent"] = schema.Field("bool")
	properties["project_brief"] = bson.M{"bsonType": "string", "maxLength": 8000}
	properties["details"] = bson.M{"bsonType": "object", "additionalProperties": false, "properties": bson.M{"event_type": bson.M{"bsonType": "string", "maxLength": 120}, "event_at": bson.M{"bsonType": "string", "maxLength": 40}, "venue": bson.M{"bsonType": "string", "maxLength": 300}, "city": bson.M{"bsonType": "string", "maxLength": 120}, "country": bson.M{"bsonType": "string", "maxLength": 2}, "audience_size": bson.M{"bsonType": schema.Field("int", "long")["bsonType"], "minimum": 0, "maximum": 1000000}, "performance_duration": bson.M{"bsonType": "string", "maxLength": 120}, "production_needs": bson.M{"bsonType": "string", "maxLength": 4000}, "campaign_objective": bson.M{"bsonType": "string", "maxLength": 1000}, "target_audience": bson.M{"bsonType": "string", "maxLength": 1000}, "channels": bson.M{"bsonType": "array", "maxItems": 20, "items": bson.M{"bsonType": "string", "maxLength": 100}}, "requested_deliverables": bson.M{"bsonType": "string", "maxLength": 2000}, "usage_rights": bson.M{"bsonType": "string", "maxLength": 1000}, "exclusivity": bson.M{"bsonType": "string", "maxLength": 1000}, "launch_dates": bson.M{"bsonType": "string", "maxLength": 500}}}
	contact := properties["contact"].(bson.M)
	contact["required"] = append(contact["required"].(bson.A), "role", "country")
	cp := contact["properties"].(bson.M)
	cp["role"] = bson.M{"bsonType": "string", "minLength": 2, "maxLength": 120}
	cp["country"] = bson.M{"bsonType": "string", "pattern": `^[A-Z]{2}$`}
	idempotency := collections[1].Validator["$jsonSchema"].(bson.M)
	idempotency["required"] = append(idempotency["required"].(bson.A), "request_hash")
	idempotency["properties"].(bson.M)["request_hash"] = bson.M{"bsonType": "string", "pattern": `^[0-9a-f]{64}$`}
	return collections
}
