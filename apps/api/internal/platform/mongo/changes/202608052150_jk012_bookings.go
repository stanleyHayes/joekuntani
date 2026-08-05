package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const bookingsChangeName = "202608052150_jk012_bookings"

func bookingsChange() Change {
	collections := exactBookingsCollections()
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: bookingsChangeName, Checksum: Checksum(canonical + "|evolves=bookings"), EvolvesCollections: []string{"bookings"}, Apply: func(ctx context.Context, db *mongo.Database) error {
		if err := evolveBookings(ctx, db); err != nil {
			return err
		}
		return schema.Apply(ctx, db, collections)
	}, Verify: func(ctx context.Context, db *mongo.Database) error { return schema.Verify(ctx, db, collections) }}
}
func exactBookingsCollections() []schema.Collection {
	date := schema.Field("date")
	nullableDate := schema.Field("date", "null")
	str := schema.Field("string")
	properties := bson.M{"_id": schema.Field("objectId"), "public_id": schema.PublicIDField(), "enquiry_id": schema.PublicIDField(), "title": bson.M{"bsonType": "string", "minLength": 2, "maxLength": 160}, "service_id": schema.PublicIDField(), "start_at": date, "end_at": date, "venue": bson.M{"bsonType": "string", "maxLength": 200}, "city": bson.M{"bsonType": "string", "maxLength": 100}, "country": bson.M{"bsonType": "string", "pattern": `^[A-Z]{2}$`}, "status": bson.M{"bsonType": "string", "enum": bson.A{"tentative", "confirmed", "cancelled"}}, "fee": bson.M{"bsonType": "decimal", "minimum": bson.Decimal128{}}, "currency": bson.M{"bsonType": "string", "enum": bson.A{"GHS", "USD", "EUR", "GBP"}}, "requirements": bson.M{"bsonType": "object", "maxProperties": 30, "additionalProperties": bson.M{"bsonType": "string", "maxLength": 500}}, "version": bson.M{"bsonType": bson.A{"long", "int"}, "minimum": 1}, "deleted_at": nullableDate, "created_at": date, "updated_at": date}
	_ = str
	return []schema.Collection{{Name: "bookings", Validator: bson.M{"$jsonSchema": bson.M{"bsonType": "object", "additionalProperties": false, "required": bson.A{"_id", "public_id", "enquiry_id", "title", "service_id", "start_at", "end_at", "venue", "city", "country", "status", "fee", "currency", "requirements", "version", "created_at", "updated_at"}, "properties": properties}}, Indexes: []schema.Index{{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true}, {Name: "ix_booking_dates_status", Keys: bson.D{{Key: "start_at", Value: 1}, {Key: "end_at", Value: 1}, {Key: "status", Value: 1}}}, {Name: "ix_booking_enquiry", Keys: bson.D{{Key: "enquiry_id", Value: 1}}}, {Name: "ix_booking_service_dates", Keys: bson.D{{Key: "service_id", Value: 1}, {Key: "start_at", Value: 1}, {Key: "end_at", Value: 1}}}}}}
}
func evolveBookings(ctx context.Context, db *mongo.Database) error {
	if err := db.RunCommand(ctx, bson.D{{Key: "collMod", Value: "bookings"}, {Key: "validationLevel", Value: "off"}}).Err(); err != nil {
		return err
	}
	cur, err := db.Collection("bookings").Find(ctx, bson.M{})
	if err != nil {
		return err
	}
	var rows []bson.M
	if err = cur.All(ctx, &rows); err != nil {
		return err
	}
	for _, row := range rows {
		id := row["_id"]
		enquiry := resolvePublicID(ctx, db, "crm_enquiries", row["enquiry_id"])
		service := resolvePublicID(ctx, db, "services", row["service_id"])
		status := strings.ToLower(stringValue(row, "status"))
		if status != "tentative" && status != "confirmed" && status != "cancelled" {
			status = "tentative"
		}
		country := strings.ToUpper(stringValue(row, "country"))
		if len(country) != 2 {
			country = "GH"
		}
		requirements, ok := row["requirements"].(bson.M)
		if !ok {
			requirements = bson.M{}
		}
		fee, ok := row["fee"].(bson.Decimal128)
		if !ok {
			fee, _ = bson.ParseDecimal128("0.00")
		}
		set := bson.M{"enquiry_id": enquiry, "service_id": service, "title": stringValue(row, "title"), "venue": stringValue(row, "venue"), "city": stringValue(row, "city"), "country": country, "status": status, "fee": fee, "currency": strings.ToUpper(stringValue(row, "currency")), "requirements": requirements, "version": int64(1)}
		if _, err = db.Collection("bookings").UpdateByID(ctx, id, bson.M{"$set": set}); err != nil {
			return err
		}
	}
	return nil
}
func resolvePublicID(ctx context.Context, db *mongo.Database, collection string, value any) string {
	if s, ok := value.(string); ok {
		return s
	}
	if id, ok := value.(bson.ObjectID); ok {
		var row struct {
			PublicID string `bson:"public_id"`
		}
		if db.Collection(collection).FindOne(ctx, bson.M{"_id": id}).Decode(&row) == nil {
			return row.PublicID
		}
	}
	return "00000000-0000-4000-8000-000000000000"
}
