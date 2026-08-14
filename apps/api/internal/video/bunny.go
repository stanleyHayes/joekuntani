package video

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type BunnyProvider struct {
	config Config
	client *http.Client
}

func NewBunnyProvider(config Config, client *http.Client) (*BunnyProvider, error) {
	if !config.Enabled || config.Provider != "bunny" || config.APIKey == "" || config.LibraryID == "" {
		return nil, ErrInvalid
	}
	if client == nil {
		client = &http.Client{Timeout: 12 * time.Second}
	}
	return &BunnyProvider{config: config, client: client}, nil
}

func (provider *BunnyProvider) Name() string { return "bunny" }

type bunnyVideo struct {
	VideoLibraryID int64  `json:"videoLibraryId"`
	GUID           string `json:"guid"`
	Status         int    `json:"status"`
	Length         int    `json:"length"`
	ThumbnailFile  string `json:"thumbnailFileName"`
	// Reported once encoding finishes, and zero before that. The frame is what
	// tells the page how much room to reserve, so a portrait clip is not forced
	// into a landscape box.
	Width  int `json:"width"`
	Height int `json:"height"`
}

func (provider *BunnyProvider) Create(ctx context.Context, title string) (ProviderVideo, error) {
	body, _ := json.Marshal(map[string]string{"title": title})
	var video bunnyVideo
	if err := provider.request(ctx, http.MethodPost, "/library/"+url.PathEscape(provider.config.LibraryID)+"/videos", body, &video); err != nil {
		return ProviderVideo{}, err
	}
	if video.GUID == "" {
		return ProviderVideo{}, ErrProviderUnavailable
	}
	return provider.mapVideo(video), nil
}

func (provider *BunnyProvider) Get(ctx context.Context, videoID string) (ProviderVideo, error) {
	var video bunnyVideo
	if err := provider.request(ctx, http.MethodGet, "/library/"+url.PathEscape(provider.config.LibraryID)+"/videos/"+url.PathEscape(videoID), nil, &video); err != nil {
		return ProviderVideo{}, err
	}
	return provider.mapVideo(video), nil
}

func (provider *BunnyProvider) Delete(ctx context.Context, videoID string) error {
	return provider.request(ctx, http.MethodDelete, "/library/"+url.PathEscape(provider.config.LibraryID)+"/videos/"+url.PathEscape(videoID), nil, nil)
}

func (provider *BunnyProvider) UploadAuthorization(videoID, filename, mimeType string, expires time.Time) (UploadAuthorization, error) {
	if videoID == "" || filename == "" || !provider.config.AllowedMIMETypes[mimeType] {
		return UploadAuthorization{}, ErrInvalid
	}
	expiration := expires.Unix()
	digest := sha256.Sum256([]byte(provider.config.LibraryID + provider.config.APIKey + strconv.FormatInt(expiration, 10) + videoID))
	return UploadAuthorization{Endpoint: provider.config.UploadEndpoint, Signature: hex.EncodeToString(digest[:]), ExpirationTime: expiration, LibraryID: provider.config.LibraryID, VideoID: videoID, Filename: filename, MIMEType: mimeType}, nil
}

func (provider *BunnyProvider) Playback(videoID string) PlaybackInfo {
	host := strings.TrimRight(provider.config.CDNHostname, "/")
	return PlaybackInfo{
		EmbedURL:     "https://iframe.mediadelivery.net/embed/" + url.PathEscape(provider.config.LibraryID) + "/" + url.PathEscape(videoID),
		HLSURL:       host + "/" + url.PathEscape(videoID) + "/playlist.m3u8",
		ThumbnailURL: host + "/" + url.PathEscape(videoID) + "/thumbnail.jpg",
	}
}

func (provider *BunnyProvider) mapVideo(value bunnyVideo) ProviderVideo {
	playback := provider.Playback(value.GUID)
	return ProviderVideo{ID: value.GUID, LibraryID: provider.config.LibraryID, Status: bunnyStatus(value.Status), DurationSeconds: value.Length, Width: value.Width, Height: value.Height, ThumbnailURL: playback.ThumbnailURL}
}

func bunnyStatus(status int) Status {
	switch status {
	case 3, 4:
		return StatusReady
	case 5, 8:
		return StatusFailed
	case 0, 1, 2, 7:
		return StatusProcessing
	default:
		return StatusUploading
	}
}

func (provider *BunnyProvider) request(ctx context.Context, method, path string, body []byte, target any) error {
	request, err := http.NewRequestWithContext(ctx, method, provider.config.APIBaseURL+path, bytes.NewReader(body))
	if err != nil {
		return ErrProviderUnavailable
	}
	request.Header.Set("AccessKey", provider.config.APIKey)
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := provider.client.Do(request)
	if err != nil {
		return ErrProviderUnavailable
	}
	defer response.Body.Close()
	// Provider deletion is idempotent. If a previous request removed the asset
	// but the local tombstone write failed, retrying must still be able to close
	// the local lifecycle rather than leaving a permanent ghost record.
	if method == http.MethodDelete && response.StatusCode == http.StatusNotFound {
		_, _ = io.Copy(io.Discard, response.Body)
		return nil
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 32<<10))
		return fmt.Errorf("%w: provider returned %d", ErrProviderUnavailable, response.StatusCode)
	}
	if target == nil {
		_, _ = io.Copy(io.Discard, response.Body)
		return nil
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(target); err != nil {
		return ErrProviderUnavailable
	}
	return nil
}
