package seed

import "testing"

func TestProductionSeedIsForbiddenBeforeDatabaseAccess(t *testing.T) {
	t.Setenv(productionOptIn, "")

	for _, environment := range []string{"production", "prod", ""} {
		if err := Run(t.Context(), nil, environment, nil); err == nil {
			t.Errorf("Run(environment=%q) error = nil, want forbidden", environment)
		}
	}
}

// The override is deliberately narrow: only the exact string "yes" opens it, so
// a stray "1", "true" or empty assignment still fails closed.
func TestProductionSeedRequiresExactOptIn(t *testing.T) {
	for _, value := range []string{"", "1", "true", "YES", "no"} {
		t.Run("value="+value, func(t *testing.T) {
			t.Setenv(productionOptIn, value)
			if err := Run(t.Context(), nil, "production", nil); err == nil {
				t.Errorf("Run with %s=%q error = nil, want forbidden", productionOptIn, value)
			}
		})
	}

	t.Setenv(productionOptIn, "yes")
	if !seedingAllowed("production") {
		t.Errorf("seedingAllowed(production) = false with %s=yes, want true", productionOptIn)
	}
}

func TestSeedingAllowedByEnvironment(t *testing.T) {
	t.Setenv(productionOptIn, "")

	for _, environment := range []string{"local", "development", "test", "preview", "staging"} {
		if !seedingAllowed(environment) {
			t.Errorf("seedingAllowed(%q) = false, want true", environment)
		}
	}
	for _, environment := range []string{"production", "prod", ""} {
		if seedingAllowed(environment) {
			t.Errorf("seedingAllowed(%q) = true without opt-in, want false", environment)
		}
	}
}

// The registry used to be required to stay empty, which enforced "no invented
// data" by making seeding impossible. Initial content is now seeded on purpose,
// so the guard moves to what can actually be checked: every seed is fully
// declared, names and checksums are unique, and production remains unreachable
// (covered above). Whether a seed's *content* invents claims is a review
// concern — see the header comment on each seed file.
func TestRegistrySeedsAreFullyDeclared(t *testing.T) {
	t.Parallel()

	names := map[string]bool{}
	for _, item := range Registry() {
		if item.Name == "" || item.Checksum == "" || item.Apply == nil {
			t.Errorf("seed %+v is missing a name, checksum or apply function", item.Name)
		}
		if names[item.Name] {
			t.Errorf("seed name %q is registered more than once", item.Name)
		}
		names[item.Name] = true
	}
}
