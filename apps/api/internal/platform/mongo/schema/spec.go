package schema

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Index struct {
	Name               string
	Keys               bson.D
	Unique             bool
	Partial            bson.D
	ExpireAfterSeconds *int32 `json:",omitempty"`
}

type Collection struct {
	Name      string
	Validator bson.M
	Indexes   []Index
}

func ValidateSpecs(collections []Collection) error {
	seenCollections := make(map[string]struct{}, len(collections))
	var validationErrors []error

	for _, collection := range collections {
		if strings.TrimSpace(collection.Name) == "" {
			validationErrors = append(validationErrors, errors.New("collection name is required"))
			continue
		}
		if _, exists := seenCollections[collection.Name]; exists {
			validationErrors = append(validationErrors, fmt.Errorf("duplicate collection %q", collection.Name))
		}
		seenCollections[collection.Name] = struct{}{}

		seenIndexes := make(map[string]struct{}, len(collection.Indexes))
		for _, index := range collection.Indexes {
			if strings.TrimSpace(index.Name) == "" || len(index.Keys) == 0 {
				validationErrors = append(validationErrors, fmt.Errorf("collection %q has an unnamed or empty index", collection.Name))
				continue
			}
			if _, exists := seenIndexes[index.Name]; exists {
				validationErrors = append(validationErrors, fmt.Errorf("collection %q has duplicate index %q", collection.Name, index.Name))
			}
			seenIndexes[index.Name] = struct{}{}
		}
	}

	return errors.Join(validationErrors...)
}

func JSONSchema(required []string, properties bson.M) bson.M {
	properties["_id"] = Field("objectId")
	requiredWithID := append([]string{"_id"}, required...)
	return bson.M{
		"$jsonSchema": bson.M{
			"bsonType":             "object",
			"required":             requiredWithID,
			"properties":           properties,
			"additionalProperties": true,
		},
	}
}

func PublicIDField() bson.M {
	return bson.M{
		"bsonType": "string",
		"pattern":  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
	}
}

func CanonicalChecksum(collections []Collection) (string, error) {
	encoded, err := json.Marshal(collections)
	if err != nil {
		return "", fmt.Errorf("encode canonical collection specs: %w", err)
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), nil
}

func Field(types ...string) bson.M {
	if len(types) == 1 {
		return bson.M{"bsonType": types[0]}
	}
	return bson.M{"bsonType": types}
}
