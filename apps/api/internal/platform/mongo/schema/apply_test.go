package schema

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestCanonicalValueNormalizesMongoIntegerWidths(t *testing.T) {
	expected := bson.M{"minimum": 1, "maxLength": 80}
	actual := bson.M{"minimum": int32(1), "maxLength": int64(80)}
	if !reflect.DeepEqual(canonicalValue(actual), canonicalValue(expected)) {
		t.Fatalf("integer widths differ: actual=%#v expected=%#v", canonicalValue(actual), canonicalValue(expected))
	}
}
