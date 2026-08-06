package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const checkinChangeName = "202608052320_jk025_checkin"

func checkinChange() Change {
	collections := exactCheckinCollections()
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:               checkinChangeName,
		Checksum:           Checksum(canonical + "|evolves=ticket_check_ins"),
		EvolvesCollections: []string{"ticket_check_ins"},
		Apply: func(ctx context.Context, db *mongo.Database) error {
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error {
			return schema.Verify(ctx, db, collections)
		},
	}
}

func exactCheckinCollections() []schema.Collection {
	objectID := schema.Field("objectId")
	date := schema.Field("date")
	props := bson.M{
		"_id":           objectID,
		"public_id":     schema.PublicIDField(),
		"ticket_id":     objectID,
		"event_id":      objectID,
		"checked_in_by": objectID,
		"device_label":  bson.M{"bsonType": "string", "maxLength": 80},
		"result":        bson.M{"bsonType": "string", "enum": bson.A{"admitted", "already_checked_in", "invalid", "wrong_event", "not_valid"}},
		"created_at":    date,
	}
	return []schema.Collection{{
		Name: "ticket_check_ins",
		Validator: bson.M{"$jsonSchema": bson.M{
			"bsonType":             "object",
			"additionalProperties": false,
			"required":             bson.A{"_id", "public_id", "ticket_id", "event_id", "checked_in_by", "result", "created_at"},
			"properties":           props,
		}},
		Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
			{Name: "uq_successful_ticket_checkin", Keys: bson.D{{Key: "ticket_id", Value: 1}}, Unique: true, Partial: bson.D{{Key: "result", Value: "admitted"}}},
			{Name: "ix_checkin_ticket_created", Keys: bson.D{{Key: "ticket_id", Value: 1}, {Key: "created_at", Value: 1}}},
			{Name: "ix_checkin_event_created", Keys: bson.D{{Key: "event_id", Value: 1}, {Key: "created_at", Value: 1}}},
		},
	}}
}
