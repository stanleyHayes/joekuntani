package changes

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestCampaignSchemasAreClosedAndUseDecimal128(t *testing.T) {
	collections := exactCampaignCollections()
	if len(collections) != 2 {
		t.Fatalf("collection count=%d", len(collections))
	}
	for _, collection := range collections {
		specification := collection.Validator["$jsonSchema"].(bson.M)
		if specification["additionalProperties"] != false {
			t.Fatalf("%s is not closed", collection.Name)
		}
		if len(collection.Indexes) < 2 || collection.Indexes[0].Name != "uq_public_id" || !collection.Indexes[0].Unique {
			t.Fatalf("%s lacks stable public identity", collection.Name)
		}
	}
	properties := collections[0].Validator["$jsonSchema"].(bson.M)["properties"].(bson.M)
	for _, field := range []string{"fee", "expenses"} {
		if properties[field].(bson.M)["bsonType"] != "decimal" {
			t.Fatalf("campaigns.%s is not Decimal128", field)
		}
	}
	if properties["currency"].(bson.M)["enum"] == nil || properties["asset_ids"].(bson.M)["uniqueItems"] != true {
		t.Fatal("campaign currency or asset reference constraints are missing")
	}
}
