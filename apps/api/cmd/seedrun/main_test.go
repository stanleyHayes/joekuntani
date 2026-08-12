package main

import (
	"testing"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/seed"
)

func testRegistry() []seed.Seed {
	return []seed.Seed{{Name: "alpha"}, {Name: "beta"}, {Name: "gamma"}}
}

func names(seeds []seed.Seed) []string {
	out := make([]string, 0, len(seeds))
	for _, item := range seeds {
		out = append(out, item.Name)
	}
	return out
}

func equal(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

func TestSelectSeedsWithoutFilterReturnsWholeRegistry(t *testing.T) {
	selected, err := selectSeeds(testRegistry(), "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if want := []string{"alpha", "beta", "gamma"}; !equal(names(selected), want) {
		t.Fatalf("got %v, want %v", names(selected), want)
	}
}

func TestSelectSeedsWhitespaceOnlyFilterReturnsWholeRegistry(t *testing.T) {
	selected, err := selectSeeds(testRegistry(), "  ,  ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(selected) != 3 {
		t.Fatalf("got %d seeds, want 3", len(selected))
	}
}

// The point of the filter: a production run must be able to take one seed and
// leave the registry's placeholder content behind.
func TestSelectSeedsKeepsOnlyNamedSeeds(t *testing.T) {
	selected, err := selectSeeds(testRegistry(), "gamma")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if want := []string{"gamma"}; !equal(names(selected), want) {
		t.Fatalf("got %v, want %v", names(selected), want)
	}
}

func TestSelectSeedsAcceptsSeveralNamesAndTrimsSpace(t *testing.T) {
	selected, err := selectSeeds(testRegistry(), " gamma , alpha ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if want := []string{"gamma", "alpha"}; !equal(names(selected), want) {
		t.Fatalf("got %v, want %v", names(selected), want)
	}
}

// A mistyped name must stop the run: silently seeding nothing would read as
// success and leave the database untouched.
func TestSelectSeedsRejectsUnknownName(t *testing.T) {
	if _, err := selectSeeds(testRegistry(), "delta"); err == nil {
		t.Fatal("expected an error for a name outside the registry")
	}
}

func TestSelectSeedsRejectsUnknownNameAmongKnownOnes(t *testing.T) {
	if _, err := selectSeeds(testRegistry(), "alpha,delta"); err == nil {
		t.Fatal("expected an error when one of several names is unknown")
	}
}
