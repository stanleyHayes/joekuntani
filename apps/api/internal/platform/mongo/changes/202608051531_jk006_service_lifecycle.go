package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const serviceLifecycleChangeName = "202608051531_jk006_service_lifecycle"

func serviceLifecycleChange() Change {
	collection := lifecycleServicesCollection()
	evolvesCollections := []string{"services"}
	canonical, err := schema.CanonicalChecksum([]schema.Collection{collection})
	if err != nil {
		panic(err)
	}
	return Change{
		Name:               serviceLifecycleChangeName,
		Checksum:           Checksum(canonical + "|supersedes=" + servicesChangeName + "|evolves=" + strings.Join(evolvesCollections, ",")),
		Supersedes:         []string{servicesChangeName},
		EvolvesCollections: evolvesCollections,
		Apply: func(ctx context.Context, database *mongo.Database) error {
			if _, err := database.Collection("services").UpdateMany(ctx, bson.M{"version": bson.M{"$exists": false}}, bson.M{"$set": bson.M{"version": int64(1)}}); err != nil {
				return err
			}
			return schema.Apply(ctx, database, []schema.Collection{collection})
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, []schema.Collection{collection})
		},
	}
}

func lifecycleServicesCollection() schema.Collection {
	base := exactServicesCollection()
	jsonSchema := base.Validator["$jsonSchema"].(bson.M)
	properties := jsonSchema["properties"].(bson.M)
	properties["_id"] = schema.Field("objectId")
	properties["version"] = bson.M{"bsonType": schema.Field("int", "long")["bsonType"], "minimum": 1}
	properties["retired_at"] = schema.Field("date")
	jsonSchema["required"] = bson.A{"_id", "public_id", "name", "slug", "summary", "description", "category", "active", "version", "sort_order", "form_schema", "cta", "created_at", "updated_at"}
	jsonSchema["additionalProperties"] = false
	base.Validator = bson.M{"$jsonSchema": jsonSchema}
	base.Indexes = append(base.Indexes, schema.Index{Name: "ix_service_retired_order", Keys: bson.D{{Key: "retired_at", Value: 1}, {Key: "sort_order", Value: 1}}})
	return base
}
