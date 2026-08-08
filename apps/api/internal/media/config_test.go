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

// The admin pickers post a folder per surface. An upload folder the policy does
// not list is rejected with 400, so a picker whose folder is missing here is a
// feature that silently cannot upload anything — which is exactly what happened
// to event banners and product images.
func TestPolicyAllowsEveryFolderTheConsolePostsFrom(t *testing.T) {
	config, err := LoadRuntimeConfig("local", func(key string) string {
		return map[string]string{
			"CLOUDINARY_FOLDER":         "joe-kuntani/local",
			"CLOUDINARY_CLOUD_NAME":     "cloud",
			"CLOUDINARY_API_KEY":        "key",
			"CLOUDINARY_API_SECRET":     "secret",
			"CLOUDINARY_WEBHOOK_SECRET": "hook",
		}[key]
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, folder := range []string{"content", "press", "documents", "brand", "events", "merch"} {
		if !config.Policy.Folders[folder] {
			t.Fatalf("uploads from the %q surface are rejected by the policy", folder)
		}
	}
}
