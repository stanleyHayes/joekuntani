package settingsschema

import "go.mongodb.org/mongo-driver/v2/bson"

func Values(nullable bool) bson.M {
	objectType := any("object")
	if nullable {
		objectType = bson.A{"object", "null"}
	}
	stringField := func(max int) bson.M { return bson.M{"bsonType": "string", "maxLength": max} }
	requiredString := func(max int) bson.M { return bson.M{"bsonType": "string", "minLength": 1, "maxLength": max} }
	publicID := bson.M{"bsonType": "string", "pattern": `^$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`}
	link := object([]string{"label", "href"}, bson.M{"label": requiredString(80), "href": requiredString(2048)})
	cta := object([]string{"key", "title", "description", "label", "href"}, bson.M{"key": bson.M{"bsonType": "string", "pattern": `^[a-z][a-z0-9_-]{1,47}$`}, "title": stringField(120), "description": stringField(300), "label": requiredString(80), "href": requiredString(2048)})
	social := object([]string{"platform", "url"}, bson.M{"platform": requiredString(50), "url": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 2048, "pattern": `^https://`}})
	properties := bson.M{
		"navigation": array(12, link), "footer": array(12, link), "ctas": array(20, cta),
		"contact":      object([]string{"public_email", "phone", "location"}, bson.M{"public_email": stringField(254), "phone": stringField(40), "location": stringField(120)}),
		"social":       array(12, social),
		"brand":        object([]string{"name", "tagline", "logo_asset_id", "favicon_asset_id"}, bson.M{"name": requiredString(100), "tagline": stringField(200), "logo_asset_id": publicID, "favicon_asset_id": publicID}),
		"seo":          object([]string{"title_template", "default_title", "description", "canonical_base", "social_image_asset_id"}, bson.M{"title_template": stringField(100), "default_title": stringField(70), "description": stringField(180), "canonical_base": stringField(2048), "social_image_asset_id": publicID}),
		"consent":      object([]string{"version", "privacy_label", "marketing_label", "privacy_url"}, bson.M{"version": requiredString(80), "privacy_label": requiredString(500), "marketing_label": stringField(500), "privacy_url": requiredString(2048)}),
		"integrations": object([]string{"email_provider", "media_provider", "analytics_provider", "payment_provider"}, bson.M{"email_provider": stringField(50), "media_provider": stringField(50), "analytics_provider": stringField(50), "payment_provider": stringField(50)}),
		"team":         object([]string{"notification_recipients", "business_timezone"}, bson.M{"notification_recipients": array(20, stringField(254)), "business_timezone": requiredString(100)}),
	}
	return bson.M{"bsonType": objectType, "required": []string{"navigation", "footer", "ctas", "contact", "social", "brand", "seo", "consent", "integrations", "team"}, "properties": properties, "additionalProperties": false}
}

func CollectionValidator() bson.M {
	return bson.M{"$jsonSchema": bson.M{
		"bsonType": "object", "additionalProperties": false,
		"required": []string{"_id", "key", "version", "draft", "published", "content_complete", "updated_by", "updated_at", "published_at"},
		"properties": bson.M{
			"_id": bson.M{"bsonType": "objectId"}, "key": bson.M{"bsonType": "string", "enum": []string{"global"}},
			"version": bson.M{"bsonType": []string{"int", "long"}, "minimum": 1}, "draft": Values(false), "published": Values(true),
			"content_complete": bson.M{"bsonType": "bool"}, "updated_by": bson.M{"bsonType": "objectId"}, "updated_at": bson.M{"bsonType": "date"}, "published_at": bson.M{"bsonType": []string{"date", "null"}},
		},
	}}
}

func object(required []string, properties bson.M) bson.M {
	return bson.M{"bsonType": "object", "required": required, "properties": properties, "additionalProperties": false}
}
func array(maxItems int, items bson.M) bson.M {
	return bson.M{"bsonType": "array", "maxItems": maxItems, "items": items}
}
