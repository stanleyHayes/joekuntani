package mongoplatform_test

import (
	"testing"
	"time"

	mongoplatform "github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo"
)

func TestConfigValidate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		config  mongoplatform.Config
		wantErr bool
	}{
		{
			name: "valid",
			config: mongoplatform.Config{
				URI: "mongodb://localhost:27017", Database: "joe_kuntani_test", Environment: "test",
			},
		},
		{name: "missing values", config: mongoplatform.Config{}, wantErr: true},
		{
			name: "unsafe database name",
			config: mongoplatform.Config{
				URI: "mongodb://localhost", Database: "production/data", Environment: "test",
			},
			wantErr: true,
		},
		{
			name: "staging cannot target production database",
			config: mongoplatform.Config{
				URI: "mongodb://localhost", Database: "joe_kuntani_production", Environment: "staging",
			},
			wantErr: true,
		},
		{
			name: "unknown environment is rejected",
			config: mongoplatform.Config{
				URI: "mongodb://localhost", Database: "joe_kuntani_demo", Environment: "demo",
			},
			wantErr: true,
		},
		{
			name: "negative timeout",
			config: mongoplatform.Config{
				URI: "mongodb://localhost", Database: "test", Environment: "test", ConnectTimeout: -time.Second,
			},
			wantErr: true,
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if err := test.config.Validate(); (err != nil) != test.wantErr {
				t.Fatalf("Validate() error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}
