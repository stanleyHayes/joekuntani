package seed

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Seed struct {
	Name     string
	Checksum string
	Apply    func(context.Context, *mongo.Database) error
}

type runRecord struct {
	Name        string     `bson:"name"`
	Environment string     `bson:"environment"`
	Checksum    string     `bson:"checksum"`
	Status      string     `bson:"status"`
	ClaimedAt   time.Time  `bson:"claimed_at"`
	AppliedAt   *time.Time `bson:"applied_at"`
}

var allowedEnvironments = map[string]struct{}{
	"local": {}, "development": {}, "test": {}, "preview": {}, "staging": {},
}

// productionOptIn is the environment variable that permits seeding a production
// database. It is separate from the environment name on purpose: seeding
// production is occasionally legitimate (an empty launch database needs its
// first content), but it must never happen because someone pointed a script at
// the wrong URI. Requiring a second, explicit signal keeps the accident
// impossible while leaving the deliberate act available.
const productionOptIn = "SEED_ALLOW_PRODUCTION"

// seedingAllowed reports whether this environment may be seeded. Split out from
// Run so the gate can be tested without a live database.
func seedingAllowed(normalizedEnvironment string) bool {
	if _, allowed := allowedEnvironments[normalizedEnvironment]; allowed {
		return true
	}
	return os.Getenv(productionOptIn) == "yes"
}

func Run(ctx context.Context, database *mongo.Database, environment string, registry []Seed) error {
	normalizedEnvironment := strings.ToLower(strings.TrimSpace(environment))
	if !seedingAllowed(normalizedEnvironment) {
		return fmt.Errorf("seed execution is forbidden in environment %q; set %s=yes to override deliberately", environment, productionOptIn)
	}
	collection := database.Collection("seed_runs")
	for _, item := range registry {
		if item.Name == "" || item.Checksum == "" || item.Apply == nil {
			return errors.New("every seed requires a name, checksum and apply function")
		}
		filter := bson.M{"name": item.Name, "environment": normalizedEnvironment}
		claimedAt := time.Now().UTC()
		claim := bson.M{"$setOnInsert": bson.M{
			"name": item.Name, "environment": normalizedEnvironment, "checksum": item.Checksum,
			"status": "applying", "claimed_at": claimedAt,
		}}
		result, err := collection.UpdateOne(ctx, filter, claim, options.UpdateOne().SetUpsert(true))
		if err != nil {
			return fmt.Errorf("claim seed %q: %w", item.Name, err)
		}
		if result.UpsertedCount == 0 {
			var existing runRecord
			if err := collection.FindOne(ctx, filter).Decode(&existing); err != nil {
				return fmt.Errorf("read seed claim %q: %w", item.Name, err)
			}
			if existing.Checksum != item.Checksum {
				return fmt.Errorf("seed %q checksum differs from recorded source", item.Name)
			}
			if existing.Status == "applied" {
				continue
			}
			return fmt.Errorf("seed %q is already claimed with status %q", item.Name, existing.Status)
		}

		if err := item.Apply(ctx, database); err != nil {
			_, _ = collection.DeleteOne(ctx, bson.M{
				"name": item.Name, "environment": normalizedEnvironment,
				"checksum": item.Checksum, "status": "applying", "claimed_at": claimedAt,
			})
			return fmt.Errorf("apply seed %q: %w", item.Name, err)
		}
		appliedAt := time.Now().UTC()
		completeFilter := bson.M{
			"name": item.Name, "environment": normalizedEnvironment,
			"checksum": item.Checksum, "status": "applying", "claimed_at": claimedAt,
		}
		complete := bson.M{"$set": bson.M{"status": "applied", "applied_at": appliedAt}}
		completion, err := collection.UpdateOne(ctx, completeFilter, complete)
		if err != nil {
			return fmt.Errorf("complete seed %q claim: %w", item.Name, err)
		}
		if completion.MatchedCount != 1 {
			return fmt.Errorf("complete seed %q claim matched %d records, want 1", item.Name, completion.MatchedCount)
		}
	}
	return nil
}

// Registry intentionally contains no demo records. Feature slices may add
// clearly labelled, non-sensitive placeholders after reserving a seed name.
func Registry() []Seed {
	return []Seed{initialContentSeed()}
}
