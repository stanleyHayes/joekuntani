package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const paymentsWebhooksChangeName = "202608051930_jk022_payments_webhooks"

func paymentsWebhooksChange() Change {
	collections := exactPaymentCollections()
	evolves := []string{"ticket_orders", "ticket_order_items", "payment_webhooks"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: paymentsWebhooksChangeName, Checksum: Checksum(canonical + "|supersedes=" + ticketOrdersInventoryChangeName + "|evolves=" + strings.Join(evolves, ",")), Supersedes: []string{ticketOrdersInventoryChangeName}, EvolvesCollections: evolves,
		Apply:  func(ctx context.Context, db *mongo.Database) error { return schema.Apply(ctx, db, collections) },
		Verify: func(ctx context.Context, db *mongo.Database) error { return schema.Verify(ctx, db, collections) }}
}

func exactPaymentCollections() []schema.Collection {
	orderCollections := exactTicketOrderCollections()
	orders := orderCollections[0]
	root := orders.Validator["$jsonSchema"].(bson.M)
	props := root["properties"].(bson.M)
	props["checkout_session_id"] = bson.M{"bsonType": "string", "maxLength": 200}
	props["checkout_url"] = bson.M{"bsonType": "string", "maxLength": 2048}
	props["checkout_expires_at"] = schema.Field("date")
	props["payment_failed_at"] = schema.Field("date")
	props["payment_failure_code"] = bson.M{"bsonType": "string", "maxLength": 100}
	webhookProps := bson.M{
		"_id": schema.Field("objectId"), "public_id": schema.PublicIDField(), "provider": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 100},
		"external_event_id": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 200}, "event_type": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 100},
		"order_reference": bson.M{"bsonType": "string", "pattern": `^JKT-[0-9]{4}-[A-Z0-9]{8}$`}, "signature_valid": bson.M{"bsonType": "bool"},
		"payload_hash": bson.M{"bsonType": "string", "pattern": `^[0-9a-f]{64}$`}, "processing_status": bson.M{"bsonType": "string", "enum": bson.A{"processed", "ignored", "failed"}},
		"processed_at": schema.Field("date"), "created_at": schema.Field("date"),
	}
	webhooks := schema.Collection{Name: "payment_webhooks", Validator: bson.M{"$jsonSchema": bson.M{"bsonType": "object", "additionalProperties": false, "required": bson.A{"_id", "public_id", "provider", "external_event_id", "event_type", "order_reference", "signature_valid", "payload_hash", "processing_status", "processed_at", "created_at"}, "properties": webhookProps}}, Indexes: []schema.Index{
		{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
		{Name: "uq_webhook_provider_event", Keys: bson.D{{Key: "provider", Value: 1}, {Key: "external_event_id", Value: 1}}, Unique: true},
		{Name: "ix_webhook_status_created", Keys: bson.D{{Key: "processing_status", Value: 1}, {Key: "created_at", Value: 1}}},
		{Name: "ix_webhook_order_created", Keys: bson.D{{Key: "order_reference", Value: 1}, {Key: "created_at", Value: 1}}},
	}}
	return []schema.Collection{orders, orderCollections[1], webhooks}
}
