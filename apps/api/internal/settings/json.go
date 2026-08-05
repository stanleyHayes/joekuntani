package settings

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
)

type valuesJSON Values

func (values *Values) UnmarshalJSON(data []byte) error {
	root, err := exactObject(data, []string{"navigation", "footer", "ctas", "contact", "social", "brand", "seo", "consent", "integrations", "team"})
	if err != nil {
		return fmt.Errorf("settings values: %w", err)
	}
	for name, keys := range map[string][]string{
		"contact":      {"public_email", "phone", "location"},
		"brand":        {"name", "tagline", "logo_asset_id", "favicon_asset_id"},
		"seo":          {"title_template", "default_title", "description", "canonical_base", "social_image_asset_id"},
		"consent":      {"version", "privacy_label", "marketing_label", "privacy_url"},
		"integrations": {"email_provider", "media_provider", "analytics_provider", "payment_provider"},
		"team":         {"notification_recipients", "business_timezone"},
	} {
		if _, err := exactObject(root[name], keys); err != nil {
			return fmt.Errorf("settings %s: %w", name, err)
		}
	}
	for name, keys := range map[string][]string{"navigation": {"label", "href"}, "footer": {"label", "href"}, "ctas": {"key", "title", "description", "label", "href"}, "social": {"platform", "url"}} {
		var items []json.RawMessage
		if err := json.Unmarshal(root[name], &items); err != nil || items == nil {
			return fmt.Errorf("settings %s must be a non-null array", name)
		}
		for index, item := range items {
			if _, err := exactObject(item, keys); err != nil {
				return fmt.Errorf("settings %s[%d]: %w", name, index, err)
			}
		}
	}
	var team map[string]json.RawMessage
	_ = json.Unmarshal(root["team"], &team)
	var recipients []string
	if err := json.Unmarshal(team["notification_recipients"], &recipients); err != nil || recipients == nil {
		return errors.New("settings team.notification_recipients must be a non-null array")
	}
	return json.Unmarshal(data, (*valuesJSON)(values))
}

func exactObject(data []byte, fields []string) (map[string]json.RawMessage, error) {
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		return nil, errors.New("must be a non-null object")
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(data, &object); err != nil || object == nil {
		return nil, errors.New("must be an object")
	}
	allowed := make(map[string]struct{}, len(fields))
	for _, field := range fields {
		allowed[field] = struct{}{}
		value, exists := object[field]
		if !exists || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return nil, fmt.Errorf("field %q is required and must not be null", field)
		}
	}
	for field := range object {
		if _, exists := allowed[field]; !exists {
			return nil, fmt.Errorf("unknown field %q", field)
		}
	}
	return object, nil
}
