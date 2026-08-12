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
// SEED_ONLY narrows the run to named seeds. On the rare deliberate production
// run the registry is the wrong unit of work: it carries placeholder content
// (an example event, for one) that belongs on a fresh developer machine and
// nowhere near a live site. Naming the seed you actually want keeps that
// content from riding along unnoticed, and an unknown name is an error rather
// than a silent no-op, so a typo cannot look like success.
//
// Usage:
//
//	set -a; source apps/api/.env; set +a
//	go run ./cmd/seedrun
//	SEED_ONLY=202608111850_video_categories go run ./cmd/seedrun
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
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

	registry := seed.Registry()
	if strings.EqualFold(strings.TrimSpace(environment), "local") {
		registry = seed.LocalShowcaseRegistry()
	}
	registry, err = selectSeeds(registry, os.Getenv("SEED_ONLY"))
	if err != nil {
		fmt.Fprintln(os.Stderr, "seed:", err)
		os.Exit(1)
	}
	if err := seed.Run(ctx, client.Database(), environment, registry); err != nil {
		fmt.Fprintln(os.Stderr, "seed:", err)
		os.Exit(1)
	}
	for _, item := range registry {
		fmt.Printf("  seed %s\n", item.Name)
	}
	fmt.Printf("%d seed(s) applied to %s (%s)\n", len(registry), os.Getenv("MONGODB_DATABASE"), environment)
}

// selectSeeds narrows registry to the comma-separated names in only. An empty
// only returns the registry untouched, so the ordinary full run is unaffected.
func selectSeeds(registry []seed.Seed, only string) ([]seed.Seed, error) {
	wanted := splitNames(only)
	if len(wanted) == 0 {
		return registry, nil
	}
	selected := make([]seed.Seed, 0, len(wanted))
	for _, name := range wanted {
		index := -1
		for position, item := range registry {
			if item.Name == name {
				index = position
				break
			}
		}
		if index < 0 {
			return nil, fmt.Errorf("SEED_ONLY names %q, which is not in the registry for this environment", name)
		}
		selected = append(selected, registry[index])
	}
	return selected, nil
}

func splitNames(value string) []string {
	names := make([]string, 0)
	for _, part := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			names = append(names, trimmed)
		}
	}
	return names
}
