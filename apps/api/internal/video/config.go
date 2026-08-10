package video

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Enabled          bool
	Provider         string
	LibraryID        string
	APIKey           string
	WebhookSecret    string
	CDNHostname      string
	APIBaseURL       string
	UploadEndpoint   string
	MaxBytes         int64
	UploadTTL        time.Duration
	AllowedMIMETypes map[string]bool
}

func LoadConfig(environment string, getenv func(string) string) (Config, error) {
	provider := strings.ToLower(strings.TrimSpace(getenv("VIDEO_PROVIDER")))
	if provider == "" || provider == "disabled" {
		return Config{Provider: "disabled"}, nil
	}
	if provider != "bunny" {
		return Config{}, fmt.Errorf("%w: unsupported VIDEO_PROVIDER", ErrInvalid)
	}
	maxBytes := int64(2 << 30)
	if raw := strings.TrimSpace(getenv("VIDEO_MAX_BYTES")); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed < 1 {
			return Config{}, fmt.Errorf("%w: VIDEO_MAX_BYTES", ErrInvalid)
		}
		maxBytes = parsed
	}
	ttl := time.Hour
	if raw := strings.TrimSpace(getenv("VIDEO_UPLOAD_AUTH_TTL")); raw != "" {
		parsed, err := time.ParseDuration(raw)
		if err != nil || parsed < time.Minute || parsed > 24*time.Hour {
			return Config{}, fmt.Errorf("%w: VIDEO_UPLOAD_AUTH_TTL", ErrInvalid)
		}
		ttl = parsed
	}
	config := Config{
		Enabled: true, Provider: provider,
		LibraryID:      strings.TrimSpace(getenv("BUNNY_STREAM_LIBRARY_ID")),
		APIKey:         strings.TrimSpace(getenv("BUNNY_STREAM_API_KEY")),
		WebhookSecret:  strings.TrimSpace(getenv("BUNNY_STREAM_WEBHOOK_SECRET")),
		CDNHostname:    strings.Trim(strings.TrimSpace(getenv("BUNNY_STREAM_CDN_HOSTNAME")), "/"),
		APIBaseURL:     strings.TrimRight(strings.TrimSpace(getenv("BUNNY_STREAM_API_BASE_URL")), "/"),
		UploadEndpoint: strings.TrimSpace(getenv("BUNNY_STREAM_TUS_ENDPOINT")),
		MaxBytes:       maxBytes, UploadTTL: ttl,
		AllowedMIMETypes: map[string]bool{"video/mp4": true, "video/webm": true, "video/quicktime": true, "video/x-matroska": true},
	}
	if config.APIBaseURL == "" {
		config.APIBaseURL = "https://video.bunnycdn.com"
	}
	if config.UploadEndpoint == "" {
		config.UploadEndpoint = "https://video.bunnycdn.com/tusupload"
	}
	if config.LibraryID == "" || config.APIKey == "" || config.WebhookSecret == "" || config.CDNHostname == "" {
		return Config{}, fmt.Errorf("%w: Bunny Stream configuration is incomplete", ErrInvalid)
	}
	if environment == "production" && !strings.HasPrefix(config.CDNHostname, "https://") {
		config.CDNHostname = "https://" + config.CDNHostname
	}
	if !strings.HasPrefix(config.CDNHostname, "http://") && !strings.HasPrefix(config.CDNHostname, "https://") {
		config.CDNHostname = "https://" + config.CDNHostname
	}
	return config, nil
}
