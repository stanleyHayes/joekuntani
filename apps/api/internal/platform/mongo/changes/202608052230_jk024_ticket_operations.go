package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const ticketOperationsChangeName = "202608052230_jk024_ticket_operations"

func ticketOperationsChange() Change {
	collections := exactTicketOperationsCollections()
	evolves := []string{"ticket_orders", "issued_tickets"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:               ticketOperationsChangeName,
		Checksum:           Checksum(canonical + "|creates=ticket_refunds,ticket_communications|evolves=" + strings.Join(evolves, ",")),
		EvolvesCollections: evolves,
		Apply: func(ctx context.Context, db *mongo.Database) error {
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error {
			return schema.Verify(ctx, db, collections)
		},
	}
}

func exactTicketOperationsCollections() []schema.Collection {
	orders := exactTicketIssuanceCollections()[0]
	props := orders.Validator["$jsonSchema"].(bson.M)["properties"].(bson.M)
	props["status"] = bson.M{"bsonType": "string", "enum": bson.A{"pending", "awaiting_payment", "paid", "payment_failed", "expired", "cancelled", "reconciliation_required", "partially_refunded", "refunded"}}

	uuid := schema.PublicIDField()
	objectID := schema.Field("objectId")
	date := schema.Field("date")
	decimal := schema.Field("decimal")
	hash := bson.M{"bsonType": "string", "pattern": `^[0-9a-f]{64}$`}
	text := func(max int) bson.M { return bson.M{"bsonType": "string", "minLength": 1, "maxLength": max} }

	issuedProps := bson.M{
		"_id":            objectID,
		"public_id":      uuid,
		"order_id":       objectID,
		"order_item_id":  objectID,
		"event_id":       objectID,
		"ticket_type_id": objectID,
		"attendee_name":  schema.Field("string", "null"),
		"qr_token_hash":  hash,
		"status":         bson.M{"bsonType": "string", "enum": bson.A{"valid", "checked_in", "void", "refunded"}},
		"checked_in_at":  schema.Field("date", "null"),
		"checked_in_by":  schema.Field("objectId", "null"),
		"voided_at":      schema.Field("date", "null"),
		"void_reason":    bson.M{"bsonType": "string", "minLength": 3, "maxLength": 500},
		"refunded_at":    schema.Field("date", "null"),
		"created_at":     date,
	}
	issued := schema.Collection{
		Name: "issued_tickets",
		Validator: bson.M{"$jsonSchema": bson.M{
			"bsonType":             "object",
			"additionalProperties": false,
			"required":             bson.A{"_id", "public_id", "order_id", "order_item_id", "event_id", "ticket_type_id", "qr_token_hash", "status", "created_at"},
			"properties":           issuedProps,
		}},
		Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
			{Name: "uq_ticket_qr_hash", Keys: bson.D{{Key: "qr_token_hash", Value: 1}}, Unique: true},
			{Name: "ix_ticket_event_status", Keys: bson.D{{Key: "event_id", Value: 1}, {Key: "status", Value: 1}}},
			{Name: "ix_ticket_order", Keys: bson.D{{Key: "order_id", Value: 1}}},
		},
	}

	refundProps := bson.M{
		"_id":                objectID,
		"public_id":          uuid,
		"order_public_id":    uuid,
		"amount":             decimal,
		"currency":           bson.M{"bsonType": "string", "enum": bson.A{"GHS", "USD", "EUR", "GBP"}},
		"reason":             bson.M{"bsonType": "string", "minLength": 3, "maxLength": 500},
		"provider":           text(100),
		"provider_reference": bson.M{"bsonType": "string", "maxLength": 200},
		"idempotency_hash":   hash,
		"request_hash":       hash,
		"status":             bson.M{"bsonType": "string", "enum": bson.A{"processing", "pending", "succeeded", "provider_failed"}},
		"error_code":         bson.M{"bsonType": "string", "maxLength": 100},
		"created_at":         date,
		"updated_at":         date,
	}
	refunds := schema.Collection{
		Name: "ticket_refunds",
		Validator: bson.M{"$jsonSchema": bson.M{
			"bsonType":             "object",
			"additionalProperties": false,
			"required":             bson.A{"_id", "public_id", "order_public_id", "amount", "currency", "reason", "provider", "idempotency_hash", "request_hash", "status", "created_at", "updated_at"},
			"properties":           refundProps,
		}},
		Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
			{Name: "uq_ticket_refund_idempotency", Keys: bson.D{{Key: "idempotency_hash", Value: 1}}, Unique: true},
			{Name: "ix_ticket_refund_order_status", Keys: bson.D{{Key: "order_public_id", Value: 1}, {Key: "status", Value: 1}}},
		},
	}

	commProps := bson.M{
		"_id":              objectID,
		"public_id":        uuid,
		"order_id":         objectID,
		"order_reference":  bson.M{"bsonType": "string", "pattern": `^JKT-[0-9]{4}-[A-Z0-9]{8}$`},
		"kind":             bson.M{"bsonType": "string", "enum": bson.A{"event.cancelled_refund_guidance"}},
		"status":           bson.M{"bsonType": "string", "enum": bson.A{"pending", "processing", "sent", "dead_letter"}},
		"reason":           bson.M{"bsonType": "string", "minLength": 3, "maxLength": 500},
		"attempts":         bson.M{"bsonType": "int", "minimum": 0, "maximum": 8},
		"next_attempt_at":  date,
		"claimed_at":       date,
		"claim_token":      uuid,
		"sent_at":          date,
		"dead_lettered_at": date,
		"last_error_code":  bson.M{"bsonType": "string", "maxLength": 100},
		"created_at":       date,
		"updated_at":       date,
	}
	communications := schema.Collection{
		Name: "ticket_communications",
		Validator: bson.M{"$jsonSchema": bson.M{
			"bsonType":             "object",
			"additionalProperties": false,
			"required":             bson.A{"_id", "public_id", "order_id", "order_reference", "kind", "status", "reason", "attempts", "next_attempt_at", "created_at", "updated_at"},
			"properties":           commProps,
		}},
		Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
			{Name: "uq_ticket_communication_order_kind", Keys: bson.D{{Key: "order_id", Value: 1}, {Key: "kind", Value: 1}}, Unique: true},
			{Name: "ix_ticket_communication_due", Keys: bson.D{{Key: "status", Value: 1}, {Key: "next_attempt_at", Value: 1}}},
		},
	}

	return []schema.Collection{orders, issued, refunds, communications}
}
