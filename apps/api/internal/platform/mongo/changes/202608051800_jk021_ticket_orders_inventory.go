package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const ticketOrdersInventoryChangeName = "202608051800_jk021_ticket_orders_inventory"

func ticketOrdersInventoryChange() Change {
	collections := exactTicketOrderCollections()
	evolves := []string{"ticket_orders", "ticket_order_items"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: ticketOrdersInventoryChangeName, Checksum: Checksum(canonical + "|evolves=" + strings.Join(evolves, ",")), EvolvesCollections: evolves,
		Apply: func(ctx context.Context, db *mongo.Database) error {
			if err := db.Collection("ticket_orders").Indexes().DropOne(ctx, "uq_ticket_order_idempotency"); err != nil {
				return err
			}
			return schema.Apply(ctx, db, collections)
		}, Verify: func(ctx context.Context, db *mongo.Database) error { return schema.Verify(ctx, db, collections) }}
}

func exactTicketOrderCollections() []schema.Collection {
	uuid, date, decimal := schema.PublicIDField(), schema.Field("date"), schema.Field("decimal")
	text := func(max int, required bool) bson.M {
		f := bson.M{"bsonType": "string", "maxLength": max}
		if required {
			f["minLength"] = 1
		}
		return f
	}
	integer := bson.M{"bsonType": schema.Field("int", "long")["bsonType"], "minimum": 1, "maximum": 1000000}
	validator := func(required bson.A, properties bson.M) bson.M {
		return bson.M{"$jsonSchema": bson.M{"bsonType": "object", "additionalProperties": false, "required": required, "properties": properties}}
	}
	orders := bson.M{"_id": schema.Field("objectId"), "public_id": uuid, "reference": bson.M{"bsonType": "string", "pattern": `^JKT-[0-9]{4}-[A-Z0-9]{8}$`}, "event_id": uuid,
		"buyer_name": text(160, true), "buyer_email": bson.M{"bsonType": "string", "pattern": `^[^@\s]+@[^@\s]+\.[^@\s]+$`, "maxLength": 254}, "buyer_phone": text(40, false), "currency": bson.M{"bsonType": "string", "enum": bson.A{"GHS", "USD", "EUR", "GBP"}},
		"subtotal": decimal, "fees": decimal, "total": decimal, "status": bson.M{"bsonType": "string", "enum": bson.A{"pending", "awaiting_payment", "paid", "payment_failed", "expired", "cancelled", "reconciliation_required"}},
		"idempotency_hash": bson.M{"bsonType": "string", "pattern": `^[0-9a-f]{64}$`}, "request_hash": bson.M{"bsonType": "string", "pattern": `^[0-9a-f]{64}$`}, "hold_expires_at": date, "terms_version": text(100, true), "terms_accepted_at": date, "payment_provider": text(100, false), "payment_reference": text(200, false), "paid_at": date, "created_at": date, "updated_at": date}
	items := bson.M{"_id": schema.Field("objectId"), "public_id": uuid, "order_id": uuid, "event_id": uuid, "ticket_type_id": uuid, "quantity": integer, "unit_price": decimal, "line_total": decimal, "created_at": date}
	return []schema.Collection{
		{Name: "ticket_orders", Validator: validator(bson.A{"_id", "public_id", "reference", "event_id", "buyer_name", "buyer_email", "buyer_phone", "currency", "subtotal", "fees", "total", "status", "idempotency_hash", "request_hash", "hold_expires_at", "terms_version", "terms_accepted_at", "created_at", "updated_at"}, orders), Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true}, {Name: "uq_ticket_order_reference", Keys: bson.D{{Key: "reference", Value: 1}}, Unique: true}, {Name: "uq_ticket_order_idempotency", Keys: bson.D{{Key: "idempotency_hash", Value: 1}}, Unique: true}, {Name: "uq_ticket_order_provider_payment_reference", Keys: bson.D{{Key: "payment_provider", Value: 1}, {Key: "payment_reference", Value: 1}}, Unique: true, Partial: bson.D{{Key: "payment_reference", Value: bson.D{{Key: "$type", Value: "string"}}}}}, {Name: "ix_ticket_order_event_status_created", Keys: bson.D{{Key: "event_id", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: 1}}}, {Name: "ix_ticket_order_hold_expiry", Keys: bson.D{{Key: "status", Value: 1}, {Key: "hold_expires_at", Value: 1}}},
		}},
		{Name: "ticket_order_items", Validator: validator(bson.A{"_id", "public_id", "order_id", "event_id", "ticket_type_id", "quantity", "unit_price", "line_total", "created_at"}, items), Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true}, {Name: "uq_order_item_ticket_type", Keys: bson.D{{Key: "order_id", Value: 1}, {Key: "ticket_type_id", Value: 1}}, Unique: true}, {Name: "ix_order_item_event_ticket", Keys: bson.D{{Key: "event_id", Value: 1}, {Key: "ticket_type_id", Value: 1}}},
		}},
	}
}
