package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const contentRevisionChangeName = "202608051539_jk007_content_revision"

func contentRevisionChange() Change {
	collections := revisionContentCollections()
	evolves := []string{"pages", "portfolio_items", "videos", "press_items", "testimonials"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:               contentRevisionChangeName,
		Checksum:           Checksum(canonical + "|supersedes=" + contentChangeName + "|evolves=" + strings.Join(evolves, ",")),
		Supersedes:         []string{contentChangeName},
		EvolvesCollections: evolves,
		Apply: func(ctx context.Context, database *mongo.Database) error {
			for _, collection := range collections {
				if _, err := database.Collection(collection.Name).UpdateMany(ctx, bson.M{"revision": bson.M{"$exists": false}}, bson.M{"$set": bson.M{"revision": int64(1)}}); err != nil {
					return err
				}
			}
			return schema.Apply(ctx, database, collections)
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, collections)
		},
	}
}

func revisionContentCollections() []schema.Collection {
	collections := exactContentCollections()
	for index := range collections {
		jsonSchema := collections[index].Validator["$jsonSchema"].(bson.M)
		properties := jsonSchema["properties"].(bson.M)
		properties["revision"] = bson.M{"bsonType": schema.Field("int", "long")["bsonType"], "minimum": 1}
		required := jsonSchema["required"].([]string)
		jsonSchema["required"] = append(required, "revision")
		collections[index].Validator = bson.M{"$jsonSchema": jsonSchema}
	}
	return collections
}
