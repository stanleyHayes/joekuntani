package settings

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/auth"
)

func TestDecoderRejectsUnknownSecretFields(t *testing.T) {
	request := httptest.NewRequest(http.MethodPut, "/api/admin/settings", strings.NewReader(`{"version":1,"values":{},"content_complete":false,"api_key":"must-not-be-accepted"}`))
	response := httptest.NewRecorder()
	var input updateRequest
	if decode(response, request, &input) {
		t.Fatal("request with unknown secret field was accepted")
	}
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", response.Code)
	}
}

func TestValuesJSONRejectsMissingNullAndNestedUnknownFields(t *testing.T) {
	valid, err := json.Marshal(validValues())
	if err != nil {
		t.Fatal(err)
	}
	var root map[string]any
	if err := json.Unmarshal(valid, &root); err != nil {
		t.Fatal(err)
	}
	tests := map[string]func(map[string]any){
		"missing required object":  func(value map[string]any) { delete(value, "seo") },
		"null required object":     func(value map[string]any) { value["contact"] = nil },
		"nested unknown":           func(value map[string]any) { value["brand"].(map[string]any)["secret"] = "no" },
		"missing array item field": func(value map[string]any) { delete(value["ctas"].([]any)[0].(map[string]any), "description") },
		"null recipients":          func(value map[string]any) { value["team"].(map[string]any)["notification_recipients"] = nil },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			var value map[string]any
			_ = json.Unmarshal(valid, &value)
			mutate(value)
			encoded, _ := json.Marshal(value)
			var decoded Values
			if json.Unmarshal(encoded, &decoded) == nil {
				t.Fatal("invalid settings JSON accepted")
			}
		})
	}
}

func TestPublicJSONStructurallyExcludesRestrictedSettings(t *testing.T) {
	encoded, err := json.Marshal(validValues().Public())
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	if err := json.Unmarshal(encoded, &body); err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"integrations", "team", "notification_recipients", "secret", "api_key"} {
		if _, exists := body[forbidden]; exists {
			t.Fatalf("public response exposed key %q", forbidden)
		}
	}
}

func TestEditorUpdateJSONStructurallyExcludesRestrictedSettings(t *testing.T) {
	view := roleView(Document{Key: GlobalKey, Draft: validValues(), Published: ptr(validValues())}, auth.RoleContentEditor)
	response := httptest.NewRecorder()
	writeJSON(response, http.StatusOK, view)
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	for _, sectionName := range []string{"draft", "published"} {
		section := body[sectionName].(map[string]any)
		if integrations := section["integrations"].(map[string]any); len(integrations) != 4 || integrations["email_provider"] != "" {
			t.Fatalf("%s integrations leaked: %#v", sectionName, integrations)
		}
		if team := section["team"].(map[string]any); len(team) != 2 || team["business_timezone"] != "" {
			t.Fatalf("%s team leaked: %#v", sectionName, team)
		}
	}
}

func TestEditorHTTPUpdateNeverReturnsRestrictedValues(t *testing.T) {
	now := time.Unix(100, 0).UTC()
	password := "valid-test-password-123"
	hash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	user := auth.User{ID: "65b25308725d0ab1f12e9361", PublicID: "018f47f6-9f5d-7d3a-8d4e-45f0f7d4c201", Name: "Editor", Email: "editor@example.invalid", PasswordHash: hash, Role: auth.RoleContentEditor, Status: "active", UpdatedAt: now}
	authService := auth.NewService(auth.NewMemoryStore(user), func() time.Time { return now }, time.Hour)
	tokens, err := authService.Login(t.Context(), auth.Credentials{Email: user.Email, Password: password})
	if err != nil {
		t.Fatal(err)
	}
	authHTTP, err := auth.NewHTTPHandler(authService, auth.HTTPConfig{AllowedOrigin: "http://example.test"})
	if err != nil {
		t.Fatal(err)
	}
	values := validValues()
	values.Brand.Tagline = "Updated by editor"
	store := NewMemoryStore(&Document{Key: GlobalKey, Version: 1, Draft: validValues()})
	handler := NewHTTPHandler(NewService(store, func() time.Time { return now }), authHTTP)
	body, err := json.Marshal(updateRequest{Version: 1, Values: values})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPut, "/api/admin/settings", strings.NewReader(string(body)))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-CSRF-Token", tokens.CSRF)
	request.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: tokens.Session})
	request.AddCookie(&http.Cookie{Name: auth.CSRFCookie, Value: tokens.CSRF})
	response := httptest.NewRecorder()
	handler.AdminUpdate().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", response.Code, response.Body.String())
	}
	var document Document
	if err := json.Unmarshal(response.Body.Bytes(), &document); err != nil {
		t.Fatal(err)
	}
	if document.Draft.Integrations.EmailProvider != "" || document.Draft.Team.BusinessTimezone != "" {
		t.Fatalf("editor HTTP response leaked restricted settings: %#v", document.Draft)
	}
	persisted, err := store.Get(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if persisted.Draft.Integrations.EmailProvider != "resend" || persisted.Draft.Team.BusinessTimezone != "Africa/Accra" {
		t.Fatal("editor HTTP update changed restricted settings")
	}
}

func ptr(value Values) *Values { return &value }
