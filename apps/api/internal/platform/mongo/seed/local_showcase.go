package seed

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// localShowcaseSeed adds unmistakably temporary records for visual review.
// Content carries the local-demo-temporary tag and events use local-demo-
// slugs, giving cleanup one precise selector when the review is complete.
const localShowcaseSeedName = "202608080900_local_showcase"

func localShowcaseSeed() Seed {
	return Seed{
		Name:     localShowcaseSeedName,
		Checksum: "local-showcase-v3",
		Apply:    applyLocalShowcase,
	}
}

func applyLocalShowcase(ctx context.Context, database *mongo.Database) error {
	now := time.Now().UTC()
	if err := seedShowcaseContent(ctx, database, now); err != nil {
		return err
	}
	return seedShowcaseEvents(ctx, database, now)
}

func seedShowcaseContent(ctx context.Context, database *mongo.Database, now time.Time) error {
	portfolio := []struct {
		slug, title, summary, body, category string
		featured                             bool
		results                              bson.A
	}{
		{"local-demo-delivery-set", "The delivery set — layout preview", "A temporary case study showing how a guitar-led comedy delivery reads in the portfolio grid.", "LOCAL DEMO — not a client claim. This longer case-study body exists to test headings, paragraphs, results and related-work layouts before approved material is entered.", "Live delivery", true, bson.A{bson.M{"label": "Format", "value": "Comedy + live guitar"}, bson.M{"label": "Use", "value": "Temporary visual review"}}},
		{"local-demo-brand-room", "A brand room with a live pulse", "Temporary brand-format content for testing alternating cards and a denser project detail page.", "LOCAL DEMO — not a campaign claim. Use this record to review the brand-work template, then remove it with the rest of the local showcase data.", "Brand", true, bson.A{bson.M{"label": "Room", "value": "Product launch preview"}, bson.M{"label": "Status", "value": "Demo only"}}},
		{"local-demo-festival-stage", "Festival stage study", "A wide-stage placeholder that tests a short title, compact summary and festival category filtering.", "LOCAL DEMO — no performance, venue or attendance is being claimed. This record exists solely to expose the finished portfolio composition.", "Festivals", true, bson.A{bson.M{"label": "Setting", "value": "Outdoor stage preview"}}},
		{"local-demo-private-room", "A song made for the room", "Temporary private-event story for checking the quieter end of the portfolio rhythm.", "LOCAL DEMO — not a testimonial or booking history. Replace with an approved story or delete after review.", "Private", false, bson.A{bson.M{"label": "Format", "value": "Private celebration preview"}}},
	}
	for _, item := range portfolio {
		document, err := showcaseBase(item.title, item.summary, item.featured, now)
		if err != nil {
			return err
		}
		document["slug"] = item.slug
		document["body"] = item.body
		document["category"] = item.category
		document["results"] = item.results
		if err = upsertSeedDocument(ctx, database, "portfolio_items", bson.M{"slug": item.slug}, document); err != nil {
			return err
		}
	}

	testimonials := []struct{ title, quote, person, role string }{
		{"Local demo quote — producer", "The room moved from the first chord to the final callback. This is temporary layout copy, not a real endorsement.", "Demo event producer", "LOCAL DEMO — NOT A CLIENT QUOTE"},
		{"Local demo quote — guest", "It felt spontaneous, musical and completely built for the audience. Temporary copy for visual review only.", "Demo audience guest", "LOCAL DEMO — NOT A CLIENT QUOTE"},
		{"Local demo quote — partner", "A performance format with enough structure for the programme and enough freedom for the room.", "Demo creative partner", "LOCAL DEMO — NOT A CLIENT QUOTE"},
	}
	for _, item := range testimonials {
		document, err := showcaseBase(item.title, item.quote, true, now)
		if err != nil {
			return err
		}
		document["body"] = ""
		document["person_name"] = item.person
		document["person_title"] = item.role
		document["organization"] = "Temporary local showcase"
		if err = upsertSeedDocument(ctx, database, "testimonials", bson.M{"title": item.title}, document); err != nil {
			return err
		}
	}

	videos := []struct{ title, summary, category, external, embed string }{
		{"Local demo — stage reel", "Temporary video card for testing a performance-led media grid.", "Performance", "https://www.youtube.com/watch?v=local-demo-stage-reel", "https://www.youtube.com/embed/local-demo-stage-reel"},
		{"Local demo — backstage conversation", "Temporary interview card for testing longer titles and mixed media categories.", "Conversation", "https://www.youtube.com/watch?v=local-demo-conversation", "https://www.youtube.com/embed/local-demo-conversation"},
		{"Local demo — guitar sketch", "Temporary short-form card for testing the compact end of the video feed.", "Sketch", "https://www.youtube.com/watch?v=local-demo-guitar-sketch", "https://www.youtube.com/embed/local-demo-guitar-sketch"},
	}
	for _, item := range videos {
		document, err := showcaseBase(item.title, item.summary, false, now)
		if err != nil {
			return err
		}
		document["body"] = "LOCAL DEMO — the URL is intentionally non-production and is removed with this showcase set."
		document["category"] = item.category
		document["external_url"] = item.external
		document["embed_url"] = item.embed
		if err = upsertSeedDocument(ctx, database, "videos", bson.M{"external_url": item.external}, document); err != nil {
			return err
		}
	}
	return nil
}

func showcaseBase(title, summary string, featured bool, now time.Time) (bson.M, error) {
	id, err := seedUUID()
	if err != nil {
		return nil, err
	}
	return bson.M{
		"public_id": id, "title": title, "summary": summary,
		"tags": bson.A{"local-demo-temporary"}, "featured": featured,
		"gallery_asset_ids": bson.A{},
		"seo":               bson.M{"title": title, "description": summary, "canonical_url": "", "social_image_asset_id": ""},
		"status":            "published", "approved": true, "revision": int64(1),
		"publish_at": now, "unpublish_at": nil, "published_at": now,
		"created_at": now, "updated_at": now,
	}, nil
}

func seedShowcaseEvents(ctx context.Context, database *mongo.Database, now time.Time) error {
	events := []struct {
		slug, title, summary, city, availability string
		months, capacity                         int
		featured                                 bool
	}{
		{"local-demo-accra-night", "Accra night — local demo", "A temporary on-sale event used to review the complete featured-event and ticket journey.", "Accra", "on_sale", 1, 240, true},
		{"local-demo-kumasi-session", "Kumasi session — local demo", "A temporary scheduled event for checking city filters and future ticket states.", "Kumasi", "scheduled", 2, 180, false},
		{"local-demo-cape-coast-room", "Cape Coast room — local demo", "A temporary sold-out event for checking unavailable states without a broken action.", "Cape Coast", "sold_out", 3, 120, false},
	}
	for index, item := range events {
		date := now.AddDate(0, item.months, index)
		starts := time.Date(date.Year(), date.Month(), date.Day(), 19, 0, 0, 0, time.UTC)
		ends := starts.Add(3 * time.Hour)
		eventID, err := seedUUID()
		if err != nil {
			return err
		}
		event := bson.M{
			"public_id": eventID, "slug": item.slug, "title": item.title,
			"summary":     item.summary,
			"description": "LOCAL DEMO — not a confirmed date. This record exists only for layout and interaction review and can be removed as a group.",
			"venue":       bson.M{"name": "Demo room — venue unconfirmed", "address": "Temporary local preview address", "city": item.city, "country_code": "GH"},
			"policies":    bson.M{"refunds": "Demo refund policy for layout review.", "entry": "Demo entry policy for layout review.", "age_limit": 16},
			"starts_at":   starts, "ends_at": ends, "timezone": "Africa/Accra",
			"capacity": item.capacity, "banner_asset_id": "",
			"banner": bson.M{"featured": item.featured, "starts_at": now.Add(-time.Hour), "ends_at": starts},
			"status": "published", "published_at": now,
			"ticket_capacity_allocated": item.capacity,
			"created_at":                now, "updated_at": now,
		}
		if err = upsertSeedDocument(ctx, database, "events", bson.M{"slug": item.slug}, event); err != nil {
			return err
		}
		if err = seedShowcaseTickets(ctx, database, eventID, item.slug, item.availability, item.capacity, now, starts); err != nil {
			return err
		}
	}
	return nil
}

func seedShowcaseTickets(ctx context.Context, database *mongo.Database, eventID, slug, availability string, capacity int, now, starts time.Time) error {
	for index, tier := range []struct{ name, description, price string }{
		{"General admission", "Main-room access for the temporary local event.", "85.00"},
		{"Front rows", "Earlier entry and front-row seating for layout review.", "160.00"},
	} {
		id, err := seedUUID()
		if err != nil {
			return err
		}
		price, err := bson.ParseDecimal128(tier.price)
		if err != nil {
			return fmt.Errorf("ticket price: %w", err)
		}
		tierCapacity := capacity * 3 / 4
		if index == 1 {
			tierCapacity = capacity / 4
		}
		sold := 0
		salesStart := now
		if availability == "scheduled" {
			salesStart = starts.AddDate(0, -1, 0)
		}
		if availability == "sold_out" {
			sold = tierCapacity
		}
		document := bson.M{
			"public_id": id, "event_id": eventID, "name": tier.name,
			"description": tier.description, "price": price, "currency": "GHS",
			"capacity": tierCapacity, "sold": sold, "reserved": 0,
			"min_per_order": 1, "max_per_order": 6,
			"sales_start": salesStart, "sales_end": starts,
			"paused": false, "status": availability, "sort_order": index,
			"created_at": now, "updated_at": now,
		}
		filter := bson.M{"event_id": eventID, "name": tier.name}
		if err = upsertSeedDocument(ctx, database, "ticket_types", filter, document); err != nil {
			return fmt.Errorf("%s: %w", slug, err)
		}
	}
	return nil
}
