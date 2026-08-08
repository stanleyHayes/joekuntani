package seed

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// A first sellable event, so ticketing has something to exercise.
//
// Without at least one published event carrying ticket types, the whole ticket
// path — reserve, checkout, payment webhook, issuance — has no inventory to act
// on, and the public events page falls back to demo fixtures. Like jk028 this
// is a starting point the owner edits in the admin dashboard, not a claim that
// this show is happening: the title says so plainly, the venue is a placeholder,
// and the date is generated relative to seeding rather than announced.
const eventFixturesSeedName = "202608071600_jk029_event_fixtures"

func eventFixturesSeed() Seed {
	return Seed{
		Name:     eventFixturesSeedName,
		Checksum: "jk029-event-fixtures-v1",
		Apply:    applyEventFixtures,
	}
}

func applyEventFixtures(ctx context.Context, database *mongo.Database) error {
	now := time.Now().UTC()
	// Far enough out that ticket sales are open on any freshly seeded machine
	// and the event never reads as already past.
	starts := now.AddDate(0, 2, 0).Truncate(time.Hour)
	ends := starts.Add(3 * time.Hour)

	eventID, err := seedUUID()
	if err != nil {
		return fmt.Errorf("event id: %w", err)
	}

	event := bson.M{
		"public_id":   eventID,
		"slug":        "placeholder-live-show",
		"title":       "Placeholder live show (edit or delete me)",
		"summary":     "A seeded example so ticketing has inventory to work with. Replace it with a real date.",
		"description": "This event exists so the ticketing flow has something to sell on a fresh environment. Edit it in the admin dashboard, or delete it once a real date is announced.",
		"venue": bson.M{
			"name":         "Venue to be confirmed",
			"address":      "Address to be confirmed",
			"city":         "Accra",
			"country_code": "GH",
		},
		"policies": bson.M{
			"refunds":   "Refunds are available up to 48 hours before the show.",
			"entry":     "Doors open one hour before the advertised start time.",
			"age_limit": 18,
		},
		"starts_at": starts,
		"ends_at":   ends,
		"timezone":  "Africa/Accra",
		"capacity":  200,
		// The collection validator requires this key even when empty; the Go
		// struct marks it omitempty, so it has to be written explicitly here.
		"banner_asset_id":           "",
		"banner":                    bson.M{"featured": false},
		"status":                    "published",
		"published_at":              now,
		"ticket_capacity_allocated": 150,
		"created_at":                now,
		"updated_at":                now,
	}
	if err := upsertSeedDocument(ctx, database, "events", bson.M{"slug": event["slug"]}, event); err != nil {
		return err
	}

	// Two tiers so per-order limits and multi-line orders are both exercisable.
	tiers := []struct {
		name, description, price string
		capacity, minPer, maxPer int
		sortOrder                int
	}{
		{"General admission", "Standing access to the main room.", "80.00", 120, 1, 6, 0},
		{"Early entry", "Enter an hour early with reserved seating.", "150.00", 30, 1, 4, 1},
	}
	for _, tier := range tiers {
		price, priceErr := bson.ParseDecimal128(tier.price)
		if priceErr != nil {
			return fmt.Errorf("ticket price %q: %w", tier.price, priceErr)
		}
		ticketID, idErr := seedUUID()
		if idErr != nil {
			return fmt.Errorf("ticket type id: %w", idErr)
		}
		ticket := bson.M{
			"public_id":     ticketID,
			"event_id":      eventID,
			"name":          tier.name,
			"description":   tier.description,
			"price":         price,
			"currency":      "GHS",
			"capacity":      tier.capacity,
			"sold":          0,
			"reserved":      0,
			"min_per_order": tier.minPer,
			"max_per_order": tier.maxPer,
			"sales_start":   now,
			"sales_end":     starts,
			"paused":        false,
			"status":        "on_sale",
			"sort_order":    tier.sortOrder,
			"created_at":    now,
			"updated_at":    now,
		}
		filter := bson.M{"event_id": eventID, "name": tier.name}
		if err := upsertSeedDocument(ctx, database, "ticket_types", filter, ticket); err != nil {
			return err
		}
	}
	return nil
}

// upsertSeedDocument keeps the seed re-runnable against a partially seeded
// database: a record that already matches the filter is left alone rather than
// duplicated, which matters because ticket rows carry live sold/reserved counts
// that must never be reset by a re-run.
func upsertSeedDocument(ctx context.Context, database *mongo.Database, collection string, filter, document bson.M) error {
	_, err := database.Collection(collection).UpdateOne(
		ctx, filter, bson.M{"$setOnInsert": document}, options.UpdateOne().SetUpsert(true),
	)
	if err != nil {
		return fmt.Errorf("seed %s: %w", collection, err)
	}
	return nil
}
