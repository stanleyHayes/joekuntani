package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const ticketIssuanceChangeName = "202608052030_jk023_ticket_issuance"

func ticketIssuanceChange() Change {
	collections := exactTicketIssuanceCollections()
	evolves := []string{"ticket_orders", "ticket_order_items", "payment_webhooks", "ticket_delivery_outbox"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: ticketIssuanceChangeName, Checksum: Checksum(canonical + "|supersedes=" + paymentsWebhooksChangeName + "|evolves=" + strings.Join(evolves, ",")), Supersedes: []string{paymentsWebhooksChangeName}, EvolvesCollections: evolves, Apply: func(ctx context.Context, db *mongo.Database) error { return schema.Apply(ctx, db, collections) }, Verify: func(ctx context.Context, db *mongo.Database) error { return schema.Verify(ctx, db, collections) }}
}

func exactTicketIssuanceCollections() []schema.Collection {
	prior := exactPaymentCollections()
	orders := prior[0]
	props := orders.Validator["$jsonSchema"].(bson.M)["properties"].(bson.M)
	props["ticket_access_hash"] = bson.M{"bsonType": "string", "pattern": `^[0-9a-f]{64}$`}
	props["ticket_access_expires_at"] = schema.Field("date")
	outboxProps := bson.M{"_id": schema.Field("objectId"), "public_id": schema.PublicIDField(), "order_id": schema.Field("objectId"), "order_reference": bson.M{"bsonType": "string", "pattern": `^JKT-[0-9]{4}-[A-Z0-9]{8}$`}, "kind": bson.M{"bsonType": "string", "enum": bson.A{"ticket.purchase_confirmation"}}, "status": bson.M{"bsonType": "string", "enum": bson.A{"pending", "processing", "sent", "dead_letter"}}, "attempts": bson.M{"bsonType": "int", "minimum": 0, "maximum": 8}, "next_attempt_at": schema.Field("date"), "claimed_at": schema.Field("date"), "sent_at": schema.Field("date"), "dead_lettered_at": schema.Field("date"), "last_error_code": bson.M{"bsonType": "string", "maxLength": 100}, "created_at": schema.Field("date"), "updated_at": schema.Field("date")}
	outbox := schema.Collection{
		Name:      "ticket_delivery_outbox",
		Validator: bson.M{"$jsonSchema": bson.M{"bsonType": "object", "additionalProperties": false, "required": bson.A{"_id", "public_id", "order_id", "order_reference", "kind", "status", "attempts", "next_attempt_at", "created_at", "updated_at"}, "properties": outboxProps}},
		Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
			{Name: "uq_ticket_delivery_order_kind", Keys: bson.D{{Key: "order_id", Value: 1}, {Key: "kind", Value: 1}}, Unique: true},
			{Name: "ix_ticket_delivery_due", Keys: bson.D{{Key: "status", Value: 1}, {Key: "next_attempt_at", Value: 1}}},
		},
	}
	return []schema.Collection{orders, prior[1], prior[2], outbox}
}
