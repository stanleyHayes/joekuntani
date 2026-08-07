// Command seedrun applies the seed registry to the configured database.
//
// Seeds are idempotent and claim-guarded, so re-running is safe: an already
// applied seed is skipped, and a seed whose source changed after being applied
// is refused rather than silently diverging.
//
// seed.Run refuses to execute outside local, development, test, preview and
// staging. Production content is published through the admin dashboard, not
// seeded — that guard is deliberate, so do not widen it to ship content.
//
// Usage:
//
//	set -a; source apps/api/.env; set +a
//	go run ./cmd/seedrun
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	mongoplatform "github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/seed"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	environment := os.Getenv("APP_ENV")
	client, err := mongoplatform.Connect(ctx, mongoplatform.Config{
		URI:         os.Getenv("MONGODB_URI"),
		Database:    os.Getenv("MONGODB_DATABASE"),
		Environment: environment,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "connect:", err)
		os.Exit(1)
	}
	defer func() { _ = client.Close(context.Background()) }()

	if err := seed.Run(ctx, client.Database(), environment, seed.Registry()); err != nil {
		fmt.Fprintln(os.Stderr, "seed:", err)
		os.Exit(1)
	}
	fmt.Printf("seed registry applied to %s (%s)\n", os.Getenv("MONGODB_DATABASE"), environment)
}
