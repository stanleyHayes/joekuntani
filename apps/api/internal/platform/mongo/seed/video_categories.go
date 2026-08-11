package seed

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const videoCategoriesSeedName = "202608111850_video_categories"

type videoCategorySeed struct{ id, slug, title, description string }

func videoCategoriesSeed() Seed {
	return Seed{Name: videoCategoriesSeedName, Checksum: "video-categories-v1", Apply: seedVideoCategories}
}

func seedVideoCategories(ctx context.Context, database *mongo.Database) error {
	owner, err := seedOwnerID(ctx, database)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	categories := initialVideoCategories()
	for order, category := range categories {
		_, err = database.Collection("video_categories").UpdateOne(ctx, bson.M{"slug": category.slug}, bson.M{"$setOnInsert": bson.M{
			"public_id": category.id, "slug": category.slug, "title": category.title,
			"description": category.description, "image_asset_id": "", "active": true,
			"sort_order": order, "revision": 1, "created_by": owner, "created_at": now, "updated_at": now,
		}}, options.UpdateOne().SetUpsert(true))
		if err != nil {
			return err
		}
	}
	return nil
}

func initialVideoCategories() []videoCategorySeed {
	return []videoCategorySeed{
		{"7c111111-1111-4111-8111-111111111111", "comedy", "Comedy", "Stand-up, character comedy, humorous commentary and comic performances."},
		{"7c222222-2222-4222-8222-222222222222", "music", "Music", "Original music, guitar sessions, live songs and musical collaborations."},
		{"7c333333-3333-4333-8333-333333333333", "acting-film", "Acting & Film", "Screen roles, short films, sketches, rehearsals and acting work."},
		{"7c444444-4444-4444-8444-444444444444", "live-performances", "Live Performances", "Stage sets, event appearances and moments recorded in front of an audience."},
		{"7c555555-5555-4555-8555-555555555555", "interviews-conversations", "Interviews & Conversations", "Interviews, podcasts, profiles and thoughtful conversations."},
		{"7c666666-6666-4666-8666-666666666666", "skits-short-form", "Skits & Short-form", "Scripted skits, social clips and quick-format creative ideas."},
		{"7c777777-7777-4777-8777-777777777777", "behind-the-scenes", "Behind the Scenes", "Creative process, rehearsals, travel, production and life around the work."},
		{"7c888888-8888-4888-8888-888888888888", "events-appearances", "Events & Appearances", "Public appearances, premieres, festivals, launches and community events."},
	}
}
