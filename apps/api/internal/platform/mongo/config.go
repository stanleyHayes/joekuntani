package mongoplatform

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

type Config struct {
	URI            string
	Database       string
	Environment    string
	ConnectTimeout time.Duration
}

func (config Config) Validate() error {
	var validationErrors []error
	normalizedEnvironment := strings.ToLower(strings.TrimSpace(config.Environment))
	normalizedDatabase := strings.ToLower(strings.TrimSpace(config.Database))
	if strings.TrimSpace(config.URI) == "" {
		validationErrors = append(validationErrors, errors.New("MongoDB URI is required"))
	}
	if strings.TrimSpace(config.Database) == "" {
		validationErrors = append(validationErrors, errors.New("MongoDB database is required"))
	}
	if strings.ContainsAny(config.Database, " /\\.$\x00") {
		validationErrors = append(validationErrors, fmt.Errorf("MongoDB database %q contains forbidden characters", config.Database))
	}
	if strings.TrimSpace(config.Environment) == "" {
		validationErrors = append(validationErrors, errors.New("application environment is required"))
	} else if !databaseMatchesEnvironment(normalizedDatabase, normalizedEnvironment) {
		validationErrors = append(validationErrors, fmt.Errorf("MongoDB database %q does not match environment %q", config.Database, config.Environment))
	}
	if config.ConnectTimeout < 0 {
		validationErrors = append(validationErrors, errors.New("MongoDB connect timeout cannot be negative"))
	}
	return errors.Join(validationErrors...)
}

func databaseMatchesEnvironment(database, environment string) bool {
	aliases := map[string][]string{
		"local":       {"local"},
		"development": {"development", "dev"},
		"test":        {"test"},
		"preview":     {"preview"},
		"staging":     {"staging"},
		"production":  {"production", "prod"},
	}
	allowedNames, known := aliases[environment]
	if !known {
		return false
	}
	if environment != "production" && (strings.Contains(database, "production") || strings.Contains(database, "prod")) {
		return false
	}
	for _, name := range allowedNames {
		if strings.Contains(database, name) {
			return true
		}
	}
	return false
}

func (config Config) timeout() time.Duration {
	if config.ConnectTimeout == 0 {
		return 10 * time.Second
	}
	return config.ConnectTimeout
}
