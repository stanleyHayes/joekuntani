package media

import (
	"context"
	"errors"
	"fmt"
	"path"
	"strconv"
	"strings"
)

type RuntimeConfig struct {
	Cloudinary CloudinaryConfig
	Policy     Policy
	Configured bool
}
type Environment func(string) string

func LoadRuntimeConfig(environment string, getenv Environment) (RuntimeConfig, error) {
	if getenv == nil {
		return RuntimeConfig{}, ErrInvalid
	}
	environment = strings.Trim(strings.ToLower(environment), "/")
	prefix := strings.Trim(getenv("CLOUDINARY_FOLDER"), "/")
	if prefix == "" || path.Base(prefix) != environment {
		return RuntimeConfig{}, fmt.Errorf("%w: CLOUDINARY_FOLDER must end with the application environment", ErrInvalid)
	}
	maxBytes, err := positiveInt(getenv("MEDIA_MAX_BYTES"), 10<<20)
	if err != nil {
		return RuntimeConfig{}, err
	}
	maxDimension, err := positiveInt(getenv("MEDIA_MAX_DIMENSION"), 6000)
	if err != nil {
		return RuntimeConfig{}, err
	}
	cloudinary := CloudinaryConfig{CloudName: getenv("CLOUDINARY_CLOUD_NAME"), APIKey: getenv("CLOUDINARY_API_KEY"), APISecret: getenv("CLOUDINARY_API_SECRET"), WebhookSecret: getenv("CLOUDINARY_WEBHOOK_SECRET")}
	configured := cloudinary.CloudName != "" && cloudinary.APIKey != "" && cloudinary.APISecret != "" && cloudinary.WebhookSecret != ""
	if environment == "production" && !configured {
		return RuntimeConfig{}, errors.New("production media provider configuration is incomplete")
	}
	return RuntimeConfig{Cloudinary: cloudinary, Configured: configured, Policy: Policy{FolderPrefix: prefix, Folders: set("content", "press", "documents"), MIME: set("image/jpeg", "image/png", "image/webp", "application/pdf"), Transforms: set("hero", "card", "thumbnail", "social"), Hosts: set("res.cloudinary.com"), MaxBytes: int64(maxBytes), MaxWidth: maxDimension, MaxHeight: maxDimension}}, nil
}
func positiveInt(value string, fallback int) (int, error) {
	if strings.TrimSpace(value) == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return 0, ErrInvalid
	}
	return parsed, nil
}
func set(values ...string) map[string]bool {
	result := map[string]bool{}
	for _, value := range values {
		result[value] = true
	}
	return result
}

type UnavailableProvider struct{}

func (UnavailableProvider) SignUpload(context.Context, Asset) (SignedUpload, error) {
	return SignedUpload{}, ErrProviderUnavailable
}
func (UnavailableProvider) VerifyCompletion(context.Context, []byte, map[string]string) (Completion, error) {
	return Completion{}, ErrProviderUnavailable
}
func (UnavailableProvider) Delete(context.Context, Asset) error { return ErrProviderUnavailable }
