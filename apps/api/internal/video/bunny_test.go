package video

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBunnyUsesAccessKeyAndStableDTO(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("AccessKey") != "server-secret" {
			t.Error("missing AccessKey")
		}
		if request.URL.Path != "/library/42/videos" {
			t.Errorf("path=%s", request.URL.Path)
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"videoLibraryId":42,"guid":"abc","status":0,"length":0}`))
	}))
	defer server.Close()
	provider, err := NewBunnyProvider(Config{Enabled: true, Provider: "bunny", LibraryID: "42", APIKey: "server-secret", APIBaseURL: server.URL, UploadEndpoint: "https://video.example/tus", CDNHostname: "https://cdn.example", AllowedMIMETypes: map[string]bool{"video/mp4": true}}, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	video, err := provider.Create(context.Background(), "Live set")
	if err != nil {
		t.Fatal(err)
	}
	if video.ID != "abc" || video.LibraryID != "42" {
		t.Fatalf("video=%+v", video)
	}
	authorization, err := provider.UploadAuthorization("abc", "set.mp4", "video/mp4", time.Unix(1000, 0))
	if err != nil {
		t.Fatal(err)
	}
	if len(authorization.Signature) != 64 || strings.Contains(authorization.Signature, "server-secret") {
		t.Fatalf("unsafe signature=%q", authorization.Signature)
	}
}

func TestBunnyDeleteTreatsAlreadyMissingAssetAsSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodDelete {
			t.Errorf("method=%s", request.Method)
		}
		response.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()
	provider, err := NewBunnyProvider(Config{Enabled: true, Provider: "bunny", LibraryID: "42", APIKey: "server-secret", APIBaseURL: server.URL}, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	if err = provider.Delete(context.Background(), "already-gone"); err != nil {
		t.Fatalf("idempotent delete error=%v", err)
	}
}
