package media

import (
	"testing"
)

func TestRuntimeConfigEnforcesEnvironmentIsolationAndProductionSecrets(t *testing.T) {
	values := map[string]string{"CLOUDINARY_FOLDER": "joe-kuntani/staging"}
	get := func(key string) string { return values[key] }
	if _, err := LoadRuntimeConfig("production", get); err == nil {
		t.Fatal("production accepted wrong folder and absent secrets")
	}
	if _, err := LoadRuntimeConfig("staging", get); err != nil {
		t.Fatal(err)
	}
	values["CLOUDINARY_FOLDER"] = "joe-kuntani/production"
	values["CLOUDINARY_CLOUD_NAME"] = "cloud"
	values["CLOUDINARY_API_KEY"] = "key"
	values["CLOUDINARY_API_SECRET"] = "secret"
	values["CLOUDINARY_WEBHOOK_SECRET"] = "hook"
	config, err := LoadRuntimeConfig("production", get)
	if err != nil {
		t.Fatal(err)
	}
	if !config.Configured || !config.Policy.Folders["content"] {
		t.Fatal("valid configuration not loaded")
	}
	values["MEDIA_MAX_BYTES"] = "invalid"
	if _, err = LoadRuntimeConfig("production", get); err == nil {
		t.Fatal("invalid limit accepted")
	}
}
