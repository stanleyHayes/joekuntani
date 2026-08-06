package config

import "testing"

func TestValidateStartupRequiresCoreDatabaseVars(t *testing.T) {
	t.Parallel()
	err := ValidateStartup(func(string) string { return "" })
	if err == nil || err.Error() == "" {
		t.Fatal("expected missing database variables")
	}
}

func TestValidateStartupProductionRequiresSecretsAndIsolation(t *testing.T) {
	t.Parallel()
	values := map[string]string{
		"APP_ENV":               "production",
		"MONGODB_URI":           "mongodb://example",
		"MONGODB_DATABASE":      "joe_staging",
		"PUBLIC_WEB_URL":        "http://example.com",
		"MFA_ENCRYPTION_KEY":    "x",
		"TICKET_TOKEN_HMAC_KEY": "y",
		"ENQUIRY_IP_HMAC_KEY":   "z",
	}
	err := ValidateStartup(func(name string) string { return values[name] })
	if err == nil {
		t.Fatal("expected production isolation failure")
	}
	values["MONGODB_DATABASE"] = "joe_production"
	values["PUBLIC_WEB_URL"] = "https://joekuntani.example"
	values["CLOUDINARY_FOLDER"] = "production/media"
	if err = ValidateStartup(func(name string) string { return values[name] }); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateStartupStagingRejectsBareProdDatabase(t *testing.T) {
	t.Parallel()
	values := map[string]string{
		"APP_ENV":               "staging",
		"MONGODB_URI":           "mongodb://example",
		"MONGODB_DATABASE":      "joe_prod",
		"PUBLIC_WEB_URL":        "https://staging.example",
		"MFA_ENCRYPTION_KEY":    "x",
		"TICKET_TOKEN_HMAC_KEY": "y",
		"ENQUIRY_IP_HMAC_KEY":   "z",
	}
	if err := ValidateStartup(func(name string) string { return values[name] }); err == nil {
		t.Fatal("expected staging/prod collision rejection")
	}
}
