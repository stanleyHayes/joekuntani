package changes

import (
	"context"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const eventsTicketTypesChangeName = "202608051620_jk019_events_ticket_types"

func eventsTicketTypesChange() Change {
	collections := exactEventCollections()
	evolves := []string{"events", "ticket_types"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:               eventsTicketTypesChangeName,
		Checksum:           Checksum(canonical + "|evolves=" + strings.Join(evolves, ",")),
		EvolvesCollections: evolves,
		Apply: func(ctx context.Context, database *mongo.Database) error {
			if _, err := database.Collection("events").UpdateMany(ctx,
				bson.M{"ticket_capacity_allocated": bson.M{"$exists": false}},
				bson.M{"$set": bson.M{"ticket_capacity_allocated": 0}},
			); err != nil {
				return err
			}
			return schema.Apply(ctx, database, collections)
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, collections)
		},
	}
}

func exactEventCollections() []schema.Collection {
	requiredString := func(max int) bson.M {
		return bson.M{"bsonType": "string", "minLength": 1, "maxLength": max}
	}
	optionalString := func(max int) bson.M { return bson.M{"bsonType": "string", "maxLength": max} }
	integer := func(minimum, maximum int) bson.M {
		return bson.M{"bsonType": schema.Field("int", "long")["bsonType"], "minimum": minimum, "maximum": maximum}
	}
	date := schema.Field("date")
	publicID := schema.PublicIDField()
	optionalPublicID := bson.M{"bsonType": "string", "pattern": `^$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`}
	venue := bson.M{
		"bsonType": "object", "additionalProperties": false,
		"required": bson.A{"name", "address", "city", "country_code"},
		"properties": bson.M{
			"name": requiredString(200), "address": requiredString(500), "city": requiredString(120),
			"country_code":  bson.M{"bsonType": "string", "pattern": `^[A-Z]{2}$`},
			"map_url":       bson.M{"bsonType": "string", "maxLength": 2048, "pattern": `^https://`},
			"accessibility": optionalString(2000),
		},
	}
	policies := bson.M{
		"bsonType": "object", "additionalProperties": false,
		"required": bson.A{"refunds", "entry", "age_limit"},
		"properties": bson.M{
			"refunds": requiredString(5000), "entry": requiredString(5000), "age_limit": integer(0, 100),
			"age_guidance": optionalString(1000), "accessibility": optionalString(2000),
		},
	}
	banner := bson.M{
		"bsonType": "object", "additionalProperties": false, "required": bson.A{"featured"},
		"properties": bson.M{"featured": schema.Field("bool"), "starts_at": date, "ends_at": date},
	}
	eventProperties := bson.M{
		"_id": schema.Field("objectId"), "public_id": publicID,
		"slug":  bson.M{"bsonType": "string", "pattern": `^[a-z0-9]+(?:-[a-z0-9]+)*$`, "maxLength": 160},
		"title": requiredString(160), "summary": optionalString(320), "description": optionalString(20000),
		"venue": venue, "policies": policies, "starts_at": date, "ends_at": date,
		"timezone": requiredString(120), "capacity": integer(1, 1_000_000),
		"ticket_capacity_allocated": integer(0, 1_000_000), "banner_asset_id": optionalPublicID, "banner": banner,
		"status":       bson.M{"bsonType": "string", "enum": bson.A{"draft", "published", "cancelled"}},
		"published_at": date, "cancelled_at": date, "created_at": date, "updated_at": date,
	}
	ticketProperties := bson.M{
		"_id": schema.Field("objectId"), "public_id": publicID, "event_id": publicID,
		"name": requiredString(120), "description": optionalString(2000), "price": schema.Field("decimal"),
		"currency": bson.M{"bsonType": "string", "pattern": `^[A-Z]{3}$`}, "capacity": integer(1, 1_000_000),
		"sold": integer(0, 1_000_000), "reserved": integer(0, 1_000_000), "min_per_order": integer(1, 1_000_000),
		"max_per_order": integer(1, 1_000_000), "sales_start": date, "sales_end": date, "paused": schema.Field("bool"),
		"status":     bson.M{"bsonType": "string", "enum": bson.A{"draft", "scheduled", "on_sale", "paused", "sold_out", "sale_ended"}},
		"sort_order": integer(0, 10000), "created_at": date, "updated_at": date,
	}
	return []schema.Collection{
		{
			Name: "events",
			Validator: bson.M{"$jsonSchema": bson.M{
				"bsonType": "object", "additionalProperties": false,
				"required":   bson.A{"_id", "public_id", "slug", "title", "summary", "description", "venue", "policies", "starts_at", "ends_at", "timezone", "capacity", "ticket_capacity_allocated", "banner_asset_id", "banner", "status", "created_at", "updated_at"},
				"properties": eventProperties,
			}},
			Indexes: []schema.Index{
				{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
				{Name: "uq_event_slug", Keys: bson.D{{Key: "slug", Value: 1}}, Unique: true},
				{Name: "ix_event_dates_status", Keys: bson.D{{Key: "starts_at", Value: 1}, {Key: "ends_at", Value: 1}, {Key: "status", Value: 1}}},
				{Name: "ix_event_banner_schedule", Keys: bson.D{{Key: "banner.featured", Value: 1}, {Key: "banner.starts_at", Value: 1}, {Key: "banner.ends_at", Value: 1}, {Key: "status", Value: 1}}},
			},
		},
		{
			Name: "ticket_types",
			Validator: bson.M{"$jsonSchema": bson.M{
				"bsonType": "object", "additionalProperties": false,
				"required":   bson.A{"_id", "public_id", "event_id", "name", "description", "price", "currency", "capacity", "sold", "reserved", "min_per_order", "max_per_order", "sales_start", "sales_end", "paused", "status", "sort_order", "created_at", "updated_at"},
				"properties": ticketProperties,
			}},
			Indexes: []schema.Index{
				{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
				{Name: "uq_ticket_type_event_name", Keys: bson.D{{Key: "event_id", Value: 1}, {Key: "name", Value: 1}}, Unique: true},
				{Name: "ix_ticket_type_event_status_order", Keys: bson.D{{Key: "event_id", Value: 1}, {Key: "status", Value: 1}, {Key: "sort_order", Value: 1}}},
				{Name: "ix_ticket_type_sale_window", Keys: bson.D{{Key: "event_id", Value: 1}, {Key: "sales_start", Value: 1}, {Key: "sales_end", Value: 1}, {Key: "paused", Value: 1}}},
			},
		},
	}
}
