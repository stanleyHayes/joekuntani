package media

import (
	"context"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"
)

type CloudinaryConfig struct {
	CloudName, APIKey, APISecret, WebhookSecret string
	UploadURL                                   string
	CallbackSkew                                time.Duration
}
type Cloudinary struct {
	config CloudinaryConfig
	now    func() time.Time
	delete func(context.Context, string) error
	client *http.Client
}

func NewCloudinary(config CloudinaryConfig, now func() time.Time, deleteFn func(context.Context, string) error) (*Cloudinary, error) {
	config.CloudName, config.APIKey, config.APISecret, config.WebhookSecret = strings.TrimSpace(config.CloudName), strings.TrimSpace(config.APIKey), strings.TrimSpace(config.APISecret), strings.TrimSpace(config.WebhookSecret)
	if config.CloudName == "" || config.APIKey == "" || config.APISecret == "" || config.WebhookSecret == "" {
		return nil, errors.New("cloudinary configuration is incomplete")
	}
	if config.UploadURL == "" {
		config.UploadURL = "https://api.cloudinary.com/v1_1/" + url.PathEscape(config.CloudName) + "/auto/upload"
	}
	parsed, err := url.Parse(config.UploadURL)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() != "api.cloudinary.com" {
		return nil, errors.New("cloudinary upload URL must use api.cloudinary.com over HTTPS")
	}
	if config.CallbackSkew <= 0 {
		config.CallbackSkew = 5 * time.Minute
	}
	if now == nil {
		now = time.Now
	}
	provider := &Cloudinary{config: config, now: now, delete: deleteFn, client: &http.Client{Timeout: 10 * time.Second}}
	if provider.delete == nil {
		provider.delete = provider.destroy
	}
	return provider, nil
}
func (provider *Cloudinary) SignUpload(_ context.Context, asset Asset) (SignedUpload, error) {
	timestamp := provider.now().UTC().Unix()
	publicID := asset.PublicID
	params := []string{"folder=" + asset.Folder, "public_id=" + publicID, "timestamp=" + strconv.FormatInt(timestamp, 10)}
	if len(asset.Tags) > 0 {
		params = append(params, "tags="+strings.Join(asset.Tags, ","))
	}
	sort.Strings(params)
	signature := sha256.Sum256([]byte(strings.Join(params, "&") + provider.config.APISecret))
	return SignedUpload{AssetID: asset.PublicID, Provider: "cloudinary", UploadURL: provider.config.UploadURL, APIKey: provider.config.APIKey, Folder: asset.Folder, PublicID: publicID, Signature: hex.EncodeToString(signature[:]), Timestamp: timestamp}, nil
}
func (provider *Cloudinary) VerifyCompletion(_ context.Context, body []byte, headers map[string]string) (Completion, error) {
	timestamp, err := strconv.ParseInt(headers["timestamp"], 10, 64)
	if err != nil {
		return Completion{}, ErrInvalidSignature
	}
	eventTime := time.Unix(timestamp, 0)
	if delta := provider.now().UTC().Sub(eventTime); delta > provider.config.CallbackSkew || delta < -provider.config.CallbackSkew {
		return Completion{}, ErrInvalidSignature
	}
	signedPayload := make([]byte, 0, len(body)+20+len(provider.config.APISecret))
	signedPayload = append(signedPayload, body...)
	signedPayload = strconv.AppendInt(signedPayload, timestamp, 10)
	signedPayload = append(signedPayload, provider.config.APISecret...)
	provided, err := hex.DecodeString(headers["signature"])
	if err != nil {
		return Completion{}, ErrInvalidSignature
	}
	var expected []byte
	switch len(provided) {
	case sha1.Size:
		digest := sha1.Sum(signedPayload)
		expected = digest[:]
	case sha256.Size:
		digest := sha256.Sum256(signedPayload)
		expected = digest[:]
	default:
		return Completion{}, ErrInvalidSignature
	}
	if subtle.ConstantTimeCompare(expected, provided) != 1 {
		return Completion{}, ErrInvalidSignature
	}
	var notification uploadReply
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	if err := decoder.Decode(&notification); err != nil {
		return Completion{}, ErrInvalid
	}
	return notification.completion(), nil
}

// uploadReply is the payload Cloudinary sends for a finished upload. The webhook
// notification and the reply the browser receives from a direct upload carry the
// same fields, so both completion paths decode into this one shape.
type uploadReply struct {
	PublicID     string `json:"public_id"`
	SecureURL    string `json:"secure_url"`
	ResourceType string `json:"resource_type"`
	Format       string `json:"format"`
	Signature    string `json:"signature"`
	Bytes        int64  `json:"bytes"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	Version      int64  `json:"version"`
}

func (reply uploadReply) completion() Completion {
	mimeType := reply.ResourceType + "/" + strings.ToLower(reply.Format)
	switch reply.Format {
	case "jpg":
		mimeType = "image/jpeg"
	case "pdf":
		mimeType = "application/pdf"
	}
	return Completion{AssetID: path.Base(reply.PublicID), StorageKey: reply.PublicID, PublicURL: reply.SecureURL, MIMEType: mimeType, Bytes: reply.Bytes, Width: reply.Width, Height: reply.Height, ProviderVersion: strconv.FormatInt(reply.Version, 10)}
}

// VerifyUploadResponse authenticates the reply Cloudinary hands back to the
// browser after a direct upload, which it signs as
// sha1("public_id=<id>&version=<v>" + api_secret).
//
// This exists because the inbound webhook is not always deliverable. A local API
// has no public hostname for Cloudinary to call, so every upload stranded at
// StatusUploading and no image a developer chose ever became usable. Hosted
// callbacks also go missing occasionally, leaving the same dead asset in
// production. The browser cannot forge this signature without the API secret, so
// relaying the reply through the client is exactly as trustworthy as the webhook
// while working everywhere.
func (provider *Cloudinary) VerifyUploadResponse(_ context.Context, body []byte) (Completion, error) {
	var reply uploadReply
	if err := json.Unmarshal(body, &reply); err != nil {
		return Completion{}, ErrInvalid
	}
	if reply.PublicID == "" || reply.Version == 0 || reply.Signature == "" {
		return Completion{}, ErrInvalid
	}
	expected := sha1.Sum([]byte("public_id=" + reply.PublicID + "&version=" + strconv.FormatInt(reply.Version, 10) + provider.config.APISecret))
	provided, err := hex.DecodeString(reply.Signature)
	if err != nil || subtle.ConstantTimeCompare(expected[:], provided) != 1 {
		return Completion{}, ErrInvalidSignature
	}
	return reply.completion(), nil
}
func (provider *Cloudinary) Delete(ctx context.Context, asset Asset) error {
	if err := provider.delete(ctx, asset.StorageKey); err != nil {
		return fmt.Errorf("delete provider asset: %w", err)
	}
	return nil
}

func (provider *Cloudinary) destroy(ctx context.Context, publicID string) error {
	timestamp := strconv.FormatInt(provider.now().UTC().Unix(), 10)
	pairs := []string{"public_id=" + publicID, "timestamp=" + timestamp}
	sort.Strings(pairs)
	digest := sha256.Sum256([]byte(strings.Join(pairs, "&") + provider.config.APISecret))
	form := url.Values{"public_id": {publicID}, "timestamp": {timestamp}, "api_key": {provider.config.APIKey}, "signature": {hex.EncodeToString(digest[:])}}
	endpoint := "https://api.cloudinary.com/v1_1/" + url.PathEscape(provider.config.CloudName) + "/image/destroy"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := provider.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(response.Body, 16<<10))
	if readErr != nil {
		return readErr
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return ErrProviderUnavailable
	}
	var result struct {
		Result string `json:"result"`
	}
	if json.Unmarshal(body, &result) != nil || (result.Result != "ok" && result.Result != "not found") {
		return ErrProviderUnavailable
	}
	return nil
}
