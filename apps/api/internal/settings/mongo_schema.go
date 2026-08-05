package settings

import (
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/settingsschema"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func MongoValuesSchema(nullable bool) bson.M { return settingsschema.Values(nullable) }
