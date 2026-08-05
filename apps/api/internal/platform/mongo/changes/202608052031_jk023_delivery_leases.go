package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const ticketDeliveryLeaseChangeName = "202608052031_jk023_delivery_leases"

func ticketDeliveryLeaseChange() Change {
	collections := exactTicketDeliveryLeaseCollections()
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: ticketDeliveryLeaseChangeName, Checksum: Checksum(canonical + "|supersedes=" + ticketIssuanceChangeName + "|evolves=ticket_delivery_outbox"), Supersedes: []string{ticketIssuanceChangeName}, EvolvesCollections: []string{"ticket_delivery_outbox"}, Apply: func(ctx context.Context, db *mongo.Database) error { return schema.Apply(ctx, db, collections) }, Verify: func(ctx context.Context, db *mongo.Database) error { return schema.Verify(ctx, db, collections) }}
}

func exactTicketDeliveryLeaseCollections() []schema.Collection {
	collections := exactTicketIssuanceCollections()
	properties := collections[3].Validator["$jsonSchema"].(bson.M)["properties"].(bson.M)
	properties["claim_token"] = bson.M{"bsonType": "string", "pattern": `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`}
	return collections
}
