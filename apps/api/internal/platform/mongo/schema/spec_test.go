package schema_test

import (
	"testing"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestValidateSpecsRejectsCollisions(t *testing.T) {
	t.Parallel()

	collection := schema.Collection{
		Name: "items",
		Indexes: []schema.Index{
			{Name: "uq_item", Keys: bson.D{{Key: "item", Value: 1}}},
			{Name: "uq_item", Keys: bson.D{{Key: "other", Value: 1}}},
		},
	}
	if err := schema.ValidateSpecs([]schema.Collection{collection, collection}); err == nil {
		t.Fatal("ValidateSpecs() error = nil, want duplicate collection/index error")
	}
}
