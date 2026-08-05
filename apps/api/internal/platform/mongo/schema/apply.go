package schema

import (
	"context"
	"fmt"
	"reflect"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func Apply(ctx context.Context, database *mongo.Database, collections []Collection) error {
	if err := ValidateSpecs(collections); err != nil {
		return fmt.Errorf("validate collection specs: %w", err)
	}

	existingNames, err := database.ListCollectionNames(ctx, bson.D{})
	if err != nil {
		return fmt.Errorf("list MongoDB collections: %w", err)
	}
	existing := make(map[string]struct{}, len(existingNames))
	for _, name := range existingNames {
		existing[name] = struct{}{}
	}

	for _, collection := range collections {
		if _, exists := existing[collection.Name]; !exists {
			createOptions := options.CreateCollection().SetValidator(collection.Validator)
			if err := database.CreateCollection(ctx, collection.Name, createOptions); err != nil {
				return fmt.Errorf("create collection %q: %w", collection.Name, err)
			}
		} else {
			command := bson.D{{Key: "collMod", Value: collection.Name}, {Key: "validator", Value: collection.Validator}}
			if err := database.RunCommand(ctx, command).Err(); err != nil {
				return fmt.Errorf("update validator for collection %q: %w", collection.Name, err)
			}
		}

		models := make([]mongo.IndexModel, 0, len(collection.Indexes))
		for _, index := range collection.Indexes {
			indexOptions := options.Index().SetName(index.Name).SetUnique(index.Unique)
			if len(index.Partial) > 0 {
				indexOptions.SetPartialFilterExpression(index.Partial)
			}
			if index.ExpireAfterSeconds != nil {
				indexOptions.SetExpireAfterSeconds(*index.ExpireAfterSeconds)
			}
			models = append(models, mongo.IndexModel{Keys: index.Keys, Options: indexOptions})
		}
		if len(models) > 0 {
			if _, err := database.Collection(collection.Name).Indexes().CreateMany(ctx, models); err != nil {
				return fmt.Errorf("create indexes for collection %q: %w", collection.Name, err)
			}
		}
	}
	return nil
}

func Verify(ctx context.Context, database *mongo.Database, collections []Collection) error {
	if err := ValidateSpecs(collections); err != nil {
		return fmt.Errorf("validate collection specs: %w", err)
	}
	existingNames, err := database.ListCollectionNames(ctx, bson.D{})
	if err != nil {
		return fmt.Errorf("list MongoDB collections: %w", err)
	}
	existing := make(map[string]struct{}, len(existingNames))
	for _, name := range existingNames {
		existing[name] = struct{}{}
	}

	for _, collection := range collections {
		if _, exists := existing[collection.Name]; !exists {
			return fmt.Errorf("required collection %q is missing", collection.Name)
		}
		collectionCursor, err := database.ListCollections(ctx, bson.M{"name": collection.Name})
		if err != nil {
			return fmt.Errorf("read validator for collection %q: %w", collection.Name, err)
		}
		var collectionDocuments []struct {
			Options struct {
				Validator bson.M `bson:"validator"`
			} `bson:"options"`
		}
		if err := collectionCursor.All(ctx, &collectionDocuments); err != nil {
			return fmt.Errorf("decode validator for collection %q: %w", collection.Name, err)
		}
		if len(collectionDocuments) != 1 || len(collectionDocuments[0].Options.Validator) == 0 {
			return fmt.Errorf("collection %q has no active validator", collection.Name)
		}
		if !reflect.DeepEqual(canonicalValue(collectionDocuments[0].Options.Validator), canonicalValue(collection.Validator)) {
			return fmt.Errorf("collection %q validator differs from source", collection.Name)
		}
		cursor, err := database.Collection(collection.Name).Indexes().List(ctx)
		if err != nil {
			return fmt.Errorf("list indexes for collection %q: %w", collection.Name, err)
		}
		var documents []struct {
			Name                    string `bson:"name"`
			Keys                    bson.D `bson:"key"`
			Unique                  bool   `bson:"unique"`
			PartialFilterExpression bson.D `bson:"partialFilterExpression"`
			ExpireAfterSeconds      *int32 `bson:"expireAfterSeconds"`
		}
		if err := cursor.All(ctx, &documents); err != nil {
			return fmt.Errorf("decode indexes for collection %q: %w", collection.Name, err)
		}
		actualIndexes := make(map[string]struct {
			Keys               bson.D
			Unique             bool
			Partial            bson.D
			ExpireAfterSeconds *int32
		}, len(documents))
		for _, document := range documents {
			actualIndexes[document.Name] = struct {
				Keys               bson.D
				Unique             bool
				Partial            bson.D
				ExpireAfterSeconds *int32
			}{Keys: document.Keys, Unique: document.Unique, Partial: document.PartialFilterExpression, ExpireAfterSeconds: document.ExpireAfterSeconds}
		}
		for _, requiredIndex := range collection.Indexes {
			actual, exists := actualIndexes[requiredIndex.Name]
			if !exists {
				return fmt.Errorf("collection %q is missing index %q", collection.Name, requiredIndex.Name)
			}
			if !indexKeysEqual(actual.Keys, requiredIndex.Keys) || actual.Unique != requiredIndex.Unique || !reflect.DeepEqual(canonicalValue(actual.Partial), canonicalValue(requiredIndex.Partial)) || !reflect.DeepEqual(actual.ExpireAfterSeconds, requiredIndex.ExpireAfterSeconds) {
				return fmt.Errorf("collection %q index %q options differ from source", collection.Name, requiredIndex.Name)
			}
		}
	}
	return nil
}

func indexKeysEqual(actual, expected bson.D) bool {
	if len(actual) != len(expected) {
		return false
	}
	for index := range actual {
		if actual[index].Key != expected[index].Key || fmt.Sprint(actual[index].Value) != fmt.Sprint(expected[index].Value) {
			return false
		}
	}
	return true
}

func canonicalValue(value any) any {
	switch typed := value.(type) {
	case bson.M:
		result := make(map[string]any, len(typed))
		for key, child := range typed {
			result[key] = canonicalValue(child)
		}
		return result
	case bson.D:
		result := make(map[string]any, len(typed))
		for _, element := range typed {
			result[element.Key] = canonicalValue(element.Value)
		}
		return result
	case bson.A:
		result := make([]any, len(typed))
		for index, child := range typed {
			result[index] = canonicalValue(child)
		}
		return result
	case []string:
		result := make([]any, len(typed))
		for index, child := range typed {
			result[index] = child
		}
		return result
	case []any:
		result := make([]any, len(typed))
		for index, child := range typed {
			result[index] = canonicalValue(child)
		}
		return result
	case int:
		return int64(typed)
	case int32:
		return int64(typed)
	case int64:
		return typed
	default:
		return value
	}
}
