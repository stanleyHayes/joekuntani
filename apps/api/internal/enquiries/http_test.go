package enquiries

import (
	"bytes"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestChallengeHandlerPublishesOperableNoStoreConfiguration(t *testing.T) {
	response := httptest.NewRecorder()
	ChallengeHandler("turnstile", "public-site-key", true).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "no-store" || !strings.Contains(response.Body.String(), `"enabled":true`) || !strings.Contains(response.Body.String(), `"provider":"turnstile"`) || !strings.Contains(response.Body.String(), `"site_key":"public-site-key"`) {
		t.Fatalf("challenge configuration=%d headers=%#v body=%s", response.Code, response.Header(), response.Body.String())
	}
	response = httptest.NewRecorder()
	ChallengeHandler("", "", false).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/", nil))
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("challenge method response=%d", response.Code)
	}
}

func TestHTTPSubmissionUsesTrustedForwardedIPAndGenericResponses(t *testing.T) {
	store := &memoryStore{receipts: map[string]Receipt{}}
	handler := NewHTTPHandler(domain(store, limiter{allow: true}, captcha{ok: true}, risk(false)), func(ip net.IP) bool { return ip.IsLoopback() })
	input := fixture()
	input.IdempotencyKey = ""
	input.ClientIP = ""
	body, _ := json.Marshal(input)
	request := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	request.RemoteAddr = "127.0.0.1:4040"
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "idem-1234567890123456")
	request.Header.Set("X-Forwarded-For", "203.0.113.9, 127.0.0.1")
	response := httptest.NewRecorder()
	handler.SubmitHandler().ServeHTTP(response, request)
	if response.Code != http.StatusCreated || !strings.Contains(response.Body.String(), "JK-2026-") {
		t.Fatalf("submission=%d %s", response.Code, response.Body.String())
	}
	if len(store.enquiries) != 1 || store.enquiries[0].IPHash == "203.0.113.9" {
		t.Fatalf("trusted IP was not privacy hashed: %#v", store.enquiries)
	}

	request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"contact":{"email":"secret@example.com"},"unknown":true}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "idem-1234567890123456")
	response = httptest.NewRecorder()
	handler.SubmitHandler().ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || strings.Contains(response.Body.String(), "secret@example.com") || strings.Contains(response.Body.String(), "unknown") {
		t.Fatalf("unsafe problem response: %d %s", response.Code, response.Body.String())
	}
}

func TestHTTPRateLimitAndUntrustedProxy(t *testing.T) {
	store := &memoryStore{receipts: map[string]Receipt{}}
	handler := NewHTTPHandler(domain(store, limiter{allow: false}, captcha{ok: true}, risk(false)), func(net.IP) bool { return false })
	input := fixture()
	input.IdempotencyKey = ""
	input.ClientIP = ""
	body, _ := json.Marshal(input)
	request := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	request.RemoteAddr = "198.51.100.3:5050"
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "idem-1234567890123456")
	request.Header.Set("X-Forwarded-For", "203.0.113.99")
	response := httptest.NewRecorder()
	handler.SubmitHandler().ServeHTTP(response, request)
	if response.Code != http.StatusTooManyRequests || response.Header().Get("Retry-After") != "60" {
		t.Fatalf("rate response=%d %#v", response.Code, response.Header())
	}
}
