package settings

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestMongoValuesSchemaIsExactAndComplete(t *testing.T) {
	schema := MongoValuesSchema(false)
	if schema["bsonType"] != "object" || schema["additionalProperties"] != false {
		t.Fatalf("root schema is not exact: %#v", schema)
	}
	want := []string{"navigation", "footer", "ctas", "contact", "social", "brand", "seo", "consent", "integrations", "team"}
	if !reflect.DeepEqual(schema["required"], want) {
		t.Fatalf("required = %#v", schema["required"])
	}
	properties := schema["properties"].(bson.M)
	for _, name := range want {
		field, exists := properties[name]
		if !exists {
			t.Fatalf("missing nested schema %q", name)
		}
		value := field.(bson.M)
		if value["bsonType"] == "object" && value["additionalProperties"] != false {
			t.Fatalf("%s permits arbitrary nested fields", name)
		}
	}
	for _, name := range []string{"navigation", "footer", "ctas", "social"} {
		array := properties[name].(bson.M)
		if array["bsonType"] != "array" || array["items"] == nil {
			t.Fatalf("%s lacks exact item schema", name)
		}
	}
	published := MongoValuesSchema(true)
	if !reflect.DeepEqual(published["bsonType"], bson.A{"object", "null"}) {
		t.Fatalf("published bsonType = %#v", published["bsonType"])
	}
}

func TestMongoAssetReferencesUseStablePublicUUIDs(t *testing.T) {
	properties := MongoValuesSchema(false)["properties"].(bson.M)
	brand := properties["brand"].(bson.M)["properties"].(bson.M)
	seo := properties["seo"].(bson.M)["properties"].(bson.M)
	for name, field := range map[string]bson.M{"logo": brand["logo_asset_id"].(bson.M), "favicon": brand["favicon_asset_id"].(bson.M), "social_image": seo["social_image_asset_id"].(bson.M)} {
		if field["pattern"] == nil {
			t.Fatalf("%s asset reference has no UUID pattern", name)
		}
	}
}
