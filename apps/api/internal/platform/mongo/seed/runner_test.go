package seed

import "testing"

func TestProductionSeedIsForbiddenBeforeDatabaseAccess(t *testing.T) {
	t.Parallel()

	for _, environment := range []string{"production", "prod", ""} {
		if err := Run(t.Context(), nil, environment, nil); err == nil {
			t.Errorf("Run(environment=%q) error = nil, want forbidden", environment)
		}
	}
}

func TestDefaultRegistryContainsNoInventedData(t *testing.T) {
	t.Parallel()
	if registry := Registry(); len(registry) != 0 {
		t.Fatalf("Registry() length = %d, want zero", len(registry))
	}
}
