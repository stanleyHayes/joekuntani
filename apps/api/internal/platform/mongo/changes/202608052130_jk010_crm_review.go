package changes

import (
	"context"
	"fmt"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const crmReviewChangeName = "202608052130_jk010_crm_review"

func crmReviewChange() Change {
	collections := exactCRMCollections()
	evolves := []string{"organizations", "contacts", "crm_enquiries", "crm_saved_views"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:               crmReviewChangeName,
		Checksum:           Checksum(canonical + "|evolves=" + strings.Join(evolves, ",")),
		Supersedes:         []string{crmChangeName},
		EvolvesCollections: evolves,
		Apply: func(ctx context.Context, db *mongo.Database) error {
			if err := evolveCRMCollections(ctx, db); err != nil {
				return err
			}
			for _, name := range []string{"crm_enquiries", "crm_saved_views"} {
				if err := db.RunCommand(ctx, bson.D{{Key: "collMod", Value: name}, {Key: "validationLevel", Value: "off"}}).Err(); err != nil && !mongo.IsDuplicateKeyError(err) {
					// Missing collections are created by schema.Apply below.
					if !strings.Contains(err.Error(), "NamespaceNotFound") {
						return fmt.Errorf("disable %s validation: %w", name, err)
					}
				}
			}
			if _, err := db.Collection("crm_enquiries").UpdateMany(ctx, bson.M{"stage": "contacted"}, bson.M{"$set": bson.M{"stage": "reviewing"}}); err != nil {
				return err
			}
			if _, err := db.Collection("crm_enquiries").UpdateMany(ctx, bson.M{"stage": "proposal"}, bson.M{"$set": bson.M{"stage": "proposal_sent"}}); err != nil {
				return err
			}
			if _, err := db.Collection("crm_saved_views").UpdateMany(ctx, bson.M{"filter.stages": "contacted"}, bson.M{"$set": bson.M{"filter.stages.$[stage]": "reviewing"}}, options.UpdateMany().SetArrayFilters([]any{bson.M{"stage": "contacted"}})); err != nil {
				return err
			}
			if _, err := db.Collection("crm_saved_views").UpdateMany(ctx, bson.M{"filter.stages": "proposal"}, bson.M{"$set": bson.M{"filter.stages.$[stage]": "proposal_sent"}}, options.UpdateMany().SetArrayFilters([]any{bson.M{"stage": "proposal"}})); err != nil {
				return err
			}
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error { return schema.Verify(ctx, db, collections) },
	}
}
