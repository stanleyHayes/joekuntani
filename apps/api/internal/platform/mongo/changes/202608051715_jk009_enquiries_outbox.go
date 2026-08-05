package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const enquiriesOutboxChangeName = "202608051715_jk009_enquiries_outbox"

func enquiriesOutboxChange() Change {
	collections := exactEnquiryCollections()
	evolves := []string{"enquiries", "enquiry_idempotency", "notification_outbox"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: enquiriesOutboxChangeName, Checksum: Checksum(canonical + "|evolves=" + strings.Join(evolves, ",")), EvolvesCollections: evolves,
		Apply:  func(ctx context.Context, db *mongo.Database) error { return schema.Apply(ctx, db, collections) },
		Verify: func(ctx context.Context, db *mongo.Database) error { return schema.Verify(ctx, db, collections) },
	}
}

func exactEnquiryCollections() []schema.Collection {
	text := func(max int, required bool) bson.M {
		field := bson.M{"bsonType": "string", "maxLength": max}
		if required {
			field["minLength"] = 1
		}
		return field
	}
	date, uuid := schema.Field("date"), schema.PublicIDField()
	contact := bson.M{"bsonType": "object", "additionalProperties": false, "required": bson.A{"name", "email", "phone", "organization"}, "properties": bson.M{
		"name": text(160, true), "email": bson.M{"bsonType": "string", "pattern": `^[^@\s]+@[^@\s]+\.[^@\s]+$`, "maxLength": 320}, "phone": text(40, false), "organization": text(200, false),
	}}
	enquiryProperties := bson.M{
		"_id": schema.Field("objectId"), "public_id": uuid, "reference": bson.M{"bsonType": "string", "pattern": `^JK-[0-9]{4}-[A-Z0-9]{6}$`}, "service_id": uuid, "contact": contact, "answers": schema.Field("object"),
		"project_brief": text(10000, true), "budget": text(200, true), "timeline": text(200, true), "consent_text": text(4000, true), "consent_version": text(100, true), "consent_at": date,
		"ip_hash": bson.M{"bsonType": "string", "pattern": `^[0-9a-f]{64}$`}, "status": bson.M{"bsonType": "string", "enum": bson.A{"new"}}, "created_at": date, "updated_at": date,
	}
	idempotencyProperties := bson.M{"_id": schema.Field("objectId"), "key_hash": bson.M{"bsonType": "string", "pattern": `^[0-9a-f]{64}$`}, "reference": bson.M{"bsonType": "string", "pattern": `^JK-[0-9]{4}-[A-Z0-9]{6}$`}, "enquiry_id": uuid, "created_at": date}
	outboxProperties := bson.M{
		"_id": schema.Field("objectId"), "public_id": uuid, "enquiry_id": uuid, "kind": bson.M{"bsonType": "string", "enum": bson.A{"enquiry.acknowledgement", "enquiry.internal_alert"}},
		"status": bson.M{"bsonType": "string", "enum": bson.A{"pending", "processing", "sent", "dead_letter"}}, "attempts": bson.M{"bsonType": schema.Field("int", "long")["bsonType"], "minimum": 0, "maximum": 8},
		"next_attempt_at": date, "claimed_at": date, "sent_at": date, "dead_lettered_at": date, "created_at": date, "updated_at": date,
	}
	validator := func(required bson.A, properties bson.M) bson.M {
		return bson.M{"$jsonSchema": bson.M{"bsonType": "object", "additionalProperties": false, "required": required, "properties": properties}}
	}
	return []schema.Collection{
		{Name: "enquiries", Validator: validator(bson.A{"_id", "public_id", "reference", "service_id", "contact", "answers", "project_brief", "budget", "timeline", "consent_text", "consent_version", "consent_at", "ip_hash", "status", "created_at", "updated_at"}, enquiryProperties), Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true}, {Name: "uq_enquiry_reference", Keys: bson.D{{Key: "reference", Value: 1}}, Unique: true}, {Name: "ix_enquiry_status_created", Keys: bson.D{{Key: "status", Value: 1}, {Key: "created_at", Value: -1}}}, {Name: "ix_enquiry_service_created", Keys: bson.D{{Key: "service_id", Value: 1}, {Key: "created_at", Value: -1}}},
		}},
		{Name: "enquiry_idempotency", Validator: validator(bson.A{"_id", "key_hash", "reference", "enquiry_id", "created_at"}, idempotencyProperties), Indexes: []schema.Index{
			{Name: "uq_enquiry_idempotency_key", Keys: bson.D{{Key: "key_hash", Value: 1}}, Unique: true}, {Name: "uq_enquiry_idempotency_enquiry", Keys: bson.D{{Key: "enquiry_id", Value: 1}}, Unique: true},
		}},
		{Name: "notification_outbox", Validator: validator(bson.A{"_id", "public_id", "enquiry_id", "kind", "status", "attempts", "next_attempt_at", "created_at", "updated_at"}, outboxProperties), Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true}, {Name: "uq_outbox_enquiry_kind", Keys: bson.D{{Key: "enquiry_id", Value: 1}, {Key: "kind", Value: 1}}, Unique: true}, {Name: "ix_outbox_due", Keys: bson.D{{Key: "status", Value: 1}, {Key: "next_attempt_at", Value: 1}}},
		}},
	}
}
