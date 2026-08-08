package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHTTPAuthenticationCSRFAndRateLimit(t *testing.T) {
	service, _, _, password := testService(t, RoleContentEditor, false)
	handler := testHTTP(t, service, true).Routes()
	login := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"email":"staff@example.invalid","password":"`+password+`"}`))
	login.RemoteAddr = "192.0.2.1:1000"
	login.Header.Set("Origin", "http://admin.test")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, login)
	if response.Code != http.StatusOK {
		t.Fatalf("login status = %d: %s", response.Code, response.Body.String())
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 2 || !cookies[0].HttpOnly || !cookies[0].Secure || cookies[0].SameSite != http.SameSiteStrictMode || cookies[0].Path != "/" {
		t.Fatalf("unsafe cookies: %#v", cookies)
	}
	var sessionCookie, csrfCookie *http.Cookie
	for _, cookie := range cookies {
		if cookie.Name == SessionCookie {
			sessionCookie = cookie
		}
		if cookie.Name == CSRFCookie {
			csrfCookie = cookie
		}
	}
	logout := httptest.NewRequest(http.MethodPost, "/logout", nil)
	logout.AddCookie(sessionCookie)
	logout.AddCookie(csrfCookie)
	denied := httptest.NewRecorder()
	handler.ServeHTTP(denied, logout)
	if denied.Code != http.StatusForbidden {
		t.Fatalf("missing CSRF status = %d", denied.Code)
	}
	logout = httptest.NewRequest(http.MethodPost, "/logout", nil)
	logout.AddCookie(sessionCookie)
	logout.AddCookie(csrfCookie)
	logout.Header.Set("X-CSRF-Token", csrfCookie.Value)
	accepted := httptest.NewRecorder()
	handler.ServeHTTP(accepted, logout)
	if accepted.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d", accepted.Code)
	}

	limited := testHTTP(t, service, false).Routes()
	for attempt := 0; attempt < 6; attempt++ {
		request := httptest.NewRequest(http.MethodPost, "/login", bytes.NewBufferString(`{"email":"bad@example.invalid","password":"not-the-password"}`))
		request.RemoteAddr = "198.51.100.2:22"
		request.Header.Set("Origin", "http://admin.test")
		result := httptest.NewRecorder()
		limited.ServeHTTP(result, request)
		if attempt == 5 && result.Code != http.StatusTooManyRequests {
			t.Fatalf("rate-limit status = %d", result.Code)
		}
	}
	setup := httptest.NewRequest(http.MethodGet, "/mfa/setup", nil)
	setup.RemoteAddr = "198.51.100.2:22"
	setup.Header.Set("Origin", "http://admin.test")
	setupResult := httptest.NewRecorder()
	limited.ServeHTTP(setupResult, setup)
	if setupResult.Code != http.StatusUnauthorized {
		t.Fatalf("MFA setup inherited login rate limit: status = %d", setupResult.Code)
	}
}

func TestLoginAndMFARejectCrossSiteOrMissingOrigin(t *testing.T) {
	service, _, _, _ := testService(t, RoleAdministrator, true)
	handler := testHTTP(t, service, true).Routes()
	for _, origin := range []string{"", "https://evil.example"} {
		request := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"email":"a@b.invalid","password":"long-enough-password"}`))
		if origin != "" {
			request.Header.Set("Origin", origin)
		}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusForbidden {
			t.Errorf("origin %q status = %d", origin, response.Code)
		}
	}
	request := httptest.NewRequest(http.MethodPost, "/mfa/verify", strings.NewReader(`{"code":"123456"}`))
	request.Header.Set("Referer", "http://admin.test/admin/login/mfa?safe=1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("same-origin Referer status = %d", response.Code)
	}
}

func TestProductionConfigFailsClosedAndProxyPolicyIsExplicit(t *testing.T) {
	service := NewService(NewMemoryStore(), time.Now, time.Hour)
	if _, err := NewHTTPHandler(service, HTTPConfig{Production: true, AllowedOrigin: "http://admin.test"}); err == nil {
		t.Fatal("insecure production configuration accepted")
	}
	handler, err := NewHTTPHandler(service, HTTPConfig{AllowedOrigin: "http://admin.test", TrustedProxyCIDRs: []string{"10.0.0.0/8"}, RateLimitCapacity: 2})
	if err != nil {
		t.Fatal(err)
	}
	untrusted := httptest.NewRequest(http.MethodPost, "/", nil)
	untrusted.RemoteAddr = "192.0.2.4:9"
	untrusted.Header.Set("X-Forwarded-For", "203.0.113.8")
	if got := handler.clientIP(untrusted); got != "192.0.2.4" {
		t.Fatalf("untrusted proxy IP = %q", got)
	}
	trusted := httptest.NewRequest(http.MethodPost, "/", nil)
	trusted.RemoteAddr = "10.1.2.3:9"
	trusted.Header.Set("X-Forwarded-For", "203.0.113.8, 10.1.2.3")
	if got := handler.clientIP(trusted); got != "203.0.113.8" {
		t.Fatalf("trusted proxy IP = %q", got)
	}
	base := time.Unix(1, 0)
	handler.limiter.allow("b", base)
	handler.limiter.allow("a", base)
	handler.limiter.allow("c", base.Add(time.Second))
	if len(handler.limiter.entries) != 2 {
		t.Fatalf("limiter entries = %d", len(handler.limiter.entries))
	}
	if _, exists := handler.limiter.entries["a"]; exists {
		t.Fatal("deterministic oldest-key eviction did not evict lexicographically first tie")
	}
}

func TestEditorCannotDisableUserOverHTTP(t *testing.T) {
	service, _, _, password := testService(t, RoleContentEditor, false)
	handler := testHTTP(t, service, false).Routes()
	login := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"email":"staff@example.invalid","password":"`+password+`"}`))
	login.RemoteAddr = "203.0.113.3:80"
	login.Header.Set("Origin", "http://admin.test")
	result := httptest.NewRecorder()
	handler.ServeHTTP(result, login)
	var sessionCookie, csrfCookie *http.Cookie
	for _, cookie := range result.Result().Cookies() {
		if cookie.Name == SessionCookie {
			sessionCookie = cookie
		}
		if cookie.Name == CSRFCookie {
			csrfCookie = cookie
		}
	}
	request := httptest.NewRequest(http.MethodPost, "/users/user-2/disable", nil)
	request.AddCookie(sessionCookie)
	request.AddCookie(csrfCookie)
	request.Header.Set("X-CSRF-Token", csrfCookie.Value)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("editor disable status = %d", response.Code)
	}
}

func TestMalformedJSONIsGeneric(t *testing.T) {
	service := NewService(NewMemoryStore(), time.Now, time.Hour)
	handler := testHTTP(t, service, false).Routes()
	request := httptest.NewRequest(http.MethodPost, "/login", strings.NewReader(`{"email":`))
	request.Header.Set("Origin", "http://admin.test")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", response.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body["title"] != "Invalid request" {
		t.Fatalf("body = %s, error = %v", response.Body.String(), err)
	}
}

var _ = context.Background

func testHTTP(t *testing.T, service *Service, secure bool) *HTTPHandler {
	t.Helper()
	handler, err := NewHTTPHandler(service, HTTPConfig{SecureCookies: secure, AllowedOrigin: "http://admin.test", RateLimitCapacity: 32})
	if err != nil {
		t.Fatal(err)
	}
	return handler
}
