package config

import (
	"fmt"
	"os"
	"strings"
)

// ValidateStartup fails fast when required secrets or isolation markers are missing.
// Development/local/test remain permissive so local scaffolds can boot without providers.
func ValidateStartup(getenv func(string) string) error {
	if getenv == nil {
		getenv = os.Getenv
	}
	env := strings.TrimSpace(getenv("APP_ENV"))
	if env == "" {
		env = "development"
	}
	required := []string{"MONGODB_URI", "MONGODB_DATABASE"}
	switch env {
	case "production", "staging":
		required = append(required,
			"PUBLIC_WEB_URL",
			"MFA_ENCRYPTION_KEY",
			"TICKET_TOKEN_HMAC_KEY",
			"ENQUIRY_IP_HMAC_KEY",
		)
	}
	var missing []string
	for _, name := range required {
		if strings.TrimSpace(getenv(name)) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required environment variables for %s: %s", env, strings.Join(missing, ", "))
	}
	if env == "production" || env == "staging" {
		database := strings.ToLower(strings.TrimSpace(getenv("MONGODB_DATABASE")))
		folder := strings.ToLower(strings.TrimSpace(getenv("CLOUDINARY_FOLDER")))
		if env == "production" {
			if strings.Contains(database, "staging") || strings.Contains(database, "preview") || strings.Contains(database, "local") {
				return fmt.Errorf("production MONGODB_DATABASE must not reference staging/preview/local isolation markers")
			}
			if folder != "" && (strings.Contains(folder, "staging") || strings.Contains(folder, "preview") || strings.Contains(folder, "local")) {
				return fmt.Errorf("production CLOUDINARY_FOLDER must not reference staging/preview/local isolation markers")
			}
		}
		if env == "staging" {
			if strings.Contains(database, "prod") && !strings.Contains(database, "staging") {
				return fmt.Errorf("staging MONGODB_DATABASE must not point at an unqualified production database name")
			}
		}
		webURL := strings.TrimSpace(getenv("PUBLIC_WEB_URL"))
		if !strings.HasPrefix(webURL, "https://") {
			return fmt.Errorf("PUBLIC_WEB_URL must be an https origin in %s", env)
		}
	}
	return nil
}
