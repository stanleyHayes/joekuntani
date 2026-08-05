package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const eventValidationChangeName = "202608051640_jk019_event_validation"

func eventValidationChange() Change {
	collections := validatedEventCollections()
	evolves := []string{"events", "ticket_types"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:               eventValidationChangeName,
		Checksum:           Checksum(canonical + "|supersedes=" + eventsTicketTypesChangeName + "|evolves=" + strings.Join(evolves, ",")),
		Supersedes:         []string{eventsTicketTypesChangeName},
		EvolvesCollections: evolves,
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return schema.Apply(ctx, database, collections)
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, collections)
		},
	}
}

func validatedEventCollections() []schema.Collection {
	collections := exactEventCollections()
	properties := collections[1].Validator["$jsonSchema"].(bson.M)["properties"].(bson.M)
	properties["currency"] = bson.M{"bsonType": "string", "enum": bson.A{"GHS", "USD", "EUR", "GBP"}}
	return collections
}
