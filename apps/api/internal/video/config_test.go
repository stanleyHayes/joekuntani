package video

import "testing"

func TestLoadConfigUsesDocumentedUploadAuthorizationTTL(t *testing.T) {
	values := map[string]string{
		"VIDEO_PROVIDER":              "bunny",
		"BUNNY_STREAM_LIBRARY_ID":     "42",
		"BUNNY_STREAM_API_KEY":        "write-key",
		"BUNNY_STREAM_WEBHOOK_SECRET": "read-key",
		"BUNNY_STREAM_CDN_HOSTNAME":   "cdn.example",
		"VIDEO_UPLOAD_AUTH_TTL":       "2h",
	}
	config, err := LoadConfig("production", func(key string) string { return values[key] })
	if err != nil {
		t.Fatal(err)
	}
	if config.UploadTTL.String() != "2h0m0s" || config.CDNHostname != "https://cdn.example" {
		t.Fatalf("config=%+v", config)
	}
}

func TestLoadConfigRejectsIncompleteEnabledProvider(t *testing.T) {
	_, err := LoadConfig("production", func(key string) string {
		if key == "VIDEO_PROVIDER" {
			return "bunny"
		}
		return ""
	})
	if err == nil {
		t.Fatal("expected incomplete configuration error")
	}
}
