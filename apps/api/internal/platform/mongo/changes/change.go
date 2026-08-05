package changes

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Change struct {
	Name               string
	Checksum           string
	Supersedes         []string
	EvolvesCollections []string
	Apply              func(context.Context, *mongo.Database) error
	Verify             func(context.Context, *mongo.Database) error
}

type appliedChange struct {
	Name      string     `bson:"name"`
	Checksum  string     `bson:"checksum"`
	Status    string     `bson:"status"`
	ClaimedAt time.Time  `bson:"claimed_at"`
	AppliedAt *time.Time `bson:"applied_at"`
}

func Checksum(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}

func ApplyAll(ctx context.Context, database *mongo.Database, registry []Change) error {
	if err := validateRegistry(registry); err != nil {
		return err
	}
	collection := database.Collection("schema_changes")
	if _, err := collection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "name", Value: 1}}, Options: options.Index().SetName("uq_change_name").SetUnique(true),
	}); err != nil {
		return fmt.Errorf("ensure schema change claim index: %w", err)
	}

	superseded := make(map[string]bool)
	for _, change := range registry {
		for _, name := range change.Supersedes {
			superseded[name] = true
		}
	}
	for _, change := range registry {
		filter := bson.M{"name": change.Name}
		claimedAt := time.Now().UTC()
		claim := bson.M{"$setOnInsert": bson.M{
			"name": change.Name, "checksum": change.Checksum, "status": "applying", "claimed_at": claimedAt,
		}}
		result, err := collection.UpdateOne(ctx, filter, claim, options.UpdateOne().SetUpsert(true))
		if err != nil {
			return fmt.Errorf("claim change %q: %w", change.Name, err)
		}
		if result.UpsertedCount == 0 {
			var applied appliedChange
			if err := collection.FindOne(ctx, filter).Decode(&applied); err != nil {
				return fmt.Errorf("read applied change %q: %w", change.Name, err)
			}
			if applied.Checksum != change.Checksum {
				return fmt.Errorf("applied change %q checksum differs from source", change.Name)
			}
			if applied.Status != "applied" {
				return fmt.Errorf("change %q is already claimed with status %q", change.Name, applied.Status)
			}
			if !superseded[change.Name] {
				if err := change.Verify(ctx, database); err != nil {
					return fmt.Errorf("verify already-applied change %q: %w", change.Name, err)
				}
			}
			continue
		}

		if err := change.Apply(ctx, database); err != nil {
			_, _ = collection.DeleteOne(ctx, bson.M{"name": change.Name, "checksum": change.Checksum, "status": "applying", "claimed_at": claimedAt})
			return fmt.Errorf("apply change %q: %w", change.Name, err)
		}
		if err := change.Verify(ctx, database); err != nil {
			_, _ = collection.DeleteOne(ctx, bson.M{"name": change.Name, "checksum": change.Checksum, "status": "applying", "claimed_at": claimedAt})
			return fmt.Errorf("verify change %q: %w", change.Name, err)
		}
		appliedAt := time.Now().UTC()
		completion, err := collection.UpdateOne(ctx,
			bson.M{"name": change.Name, "checksum": change.Checksum, "status": "applying", "claimed_at": claimedAt},
			bson.M{"$set": bson.M{"status": "applied", "applied_at": appliedAt}},
		)
		if err != nil {
			return fmt.Errorf("complete change %q claim: %w", change.Name, err)
		}
		if completion.MatchedCount != 1 {
			return fmt.Errorf("complete change %q claim matched %d records, want 1", change.Name, completion.MatchedCount)
		}
	}
	return nil
}

func validateRegistry(registry []Change) error {
	seen := make(map[string]struct{}, len(registry))
	for _, change := range registry {
		if change.Name == "" || change.Checksum == "" || change.Apply == nil || change.Verify == nil {
			return errors.New("every MongoDB change requires name, checksum, apply and verify")
		}
		if _, exists := seen[change.Name]; exists {
			return fmt.Errorf("duplicate MongoDB change %q", change.Name)
		}
		seen[change.Name] = struct{}{}
		evolvedCollections := make(map[string]struct{}, len(change.EvolvesCollections))
		for _, collection := range change.EvolvesCollections {
			if collection == "" {
				return fmt.Errorf("change %q has an empty evolved collection", change.Name)
			}
			if _, exists := evolvedCollections[collection]; exists {
				return fmt.Errorf("change %q repeats evolved collection %q", change.Name, collection)
			}
			evolvedCollections[collection] = struct{}{}
		}
		for _, superseded := range change.Supersedes {
			if superseded == change.Name {
				return fmt.Errorf("change %q cannot supersede itself", change.Name)
			}
			if _, exists := seen[superseded]; !exists {
				return fmt.Errorf("change %q supersedes unknown or later change %q", change.Name, superseded)
			}
		}
	}
	return nil
}
