package changes

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const campaignReviewChangeName = "202608052215_jk013_campaign_review"

func campaignReviewChange() Change {
	collections := exactCampaignReviewCollections()
	evolves := []string{"campaigns", "deliverables", "campaign_deliverables"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name: campaignReviewChangeName, Checksum: Checksum(canonical + "|evolves=" + strings.Join(evolves, ",")),
		Supersedes: []string{campaignsChangeName}, EvolvesCollections: evolves,
		Apply: func(ctx context.Context, db *mongo.Database) error {
			if err := migrateLegacyCampaignDeliverables(ctx, db); err != nil {
				return err
			}
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error { return schema.Verify(ctx, db, collections) },
	}
}

func exactCampaignReviewCollections() []schema.Collection {
	collections := exactCampaignCollections()
	moneyPattern := "^(0|[1-9][0-9]{0,14})\\.[0-9]{2}$"
	base := collections[0].Validator
	collections[0].Validator = bson.M{"$and": bson.A{
		base,
		bson.M{"$expr": bson.M{"$and": bson.A{
			bson.M{"$regexMatch": bson.M{"input": bson.M{"$toString": "$fee"}, "regex": moneyPattern}},
			bson.M{"$regexMatch": bson.M{"input": bson.M{"$toString": "$expenses"}, "regex": moneyPattern}},
		}}},
	}}
	return collections
}

func migrateLegacyCampaignDeliverables(ctx context.Context, db *mongo.Database) error {
	cursor, err := db.Collection("deliverables").Find(ctx, bson.M{})
	if err != nil {
		return fmt.Errorf("read legacy deliverables: %w", err)
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var legacy bson.M
		if err := cursor.Decode(&legacy); err != nil {
			return fmt.Errorf("decode legacy deliverable: %w", err)
		}
		publicID, _ := legacy["public_id"].(string)
		campaignID := resolvePublicID(ctx, db, "campaigns", legacy["campaign_id"])
		if publicID == "" || campaignID == "" {
			return fmt.Errorf("legacy deliverable %v has unresolved public or campaign identity", legacy["_id"])
		}
		createdAt := time.Now().UTC()
		if objectID, ok := legacy["_id"].(bson.ObjectID); ok {
			createdAt = objectID.Timestamp().UTC()
		}
		status := legacyEnum(legacy["status"], []string{"pending", "in_progress", "submitted", "approved", "published"}, "pending")
		approval := legacyEnum(legacy["approval_status"], []string{"pending", "approved", "rejected"}, "pending")
		publishedURL, _ := legacy["published_url"].(string)
		document := bson.M{
			"public_id": publicID, "campaign_id": campaignID, "title": legacy["title"], "platform": legacy["platform"],
			"format": legacy["format"], "due_at": legacy["due_at"], "status": status, "published_url": publishedURL,
			"approval_status": approval, "asset_ids": bson.A{}, "created_at": createdAt, "updated_at": createdAt,
		}
		if _, err := db.Collection("campaign_deliverables").UpdateOne(ctx, bson.M{"public_id": publicID}, bson.M{"$setOnInsert": document}, options.UpdateOne().SetUpsert(true)); err != nil {
			return fmt.Errorf("migrate legacy deliverable %s: %w", publicID, err)
		}
	}
	return cursor.Err()
}

func legacyEnum(value any, allowed []string, fallback string) string {
	text, _ := value.(string)
	for _, candidate := range allowed {
		if text == candidate {
			return text
		}
	}
	return fallback
}
