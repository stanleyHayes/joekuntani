package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const bootstrapChangeName = "202608051251_jk002_bootstrap_collections"

func Registry() []Change {
	collections := bootstrapCollections()
	verificationCollections := make([]schema.Collection, 0, len(collections)-2)
	for _, collection := range collections {
		// These collections are evolved and verified by later append-only changes.
		// Keeping their bootstrap validators here would make legitimate collMod
		// evolution appear as historical drift on every idempotent reapply.
		if collection.Name != "media_assets" && collection.Name != "services" && collection.Name != "pages" && collection.Name != "portfolio_items" && collection.Name != "videos" && collection.Name != "press_items" && collection.Name != "testimonials" && collection.Name != "events" && collection.Name != "ticket_types" && collection.Name != "enquiries" && collection.Name != "organizations" && collection.Name != "contacts" && collection.Name != "ticket_orders" && collection.Name != "ticket_order_items" && collection.Name != "payment_webhooks" && collection.Name != "bookings" && collection.Name != "campaigns" && collection.Name != "deliverables" {
			verificationCollections = append(verificationCollections, collection)
		}
	}
	checksum, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return []Change{{
		Name:     bootstrapChangeName,
		Checksum: checksum,
		Apply: func(ctx context.Context, database *mongo.Database) error {
			return schema.Apply(ctx, database, collections)
		},
		Verify: func(ctx context.Context, database *mongo.Database) error {
			return schema.Verify(ctx, database, verificationCollections)
		},
	}, authSessionsChange(), siteSettingsChange(), mediaAssetsChange(), exactGlobalSettingsChange(), exactMediaAssetsChange(), servicesChange(), contentChange(), serviceLifecycleChange(), contentRevisionChange(), eventsTicketTypesChange(), eventValidationChange(), enquiriesOutboxChange(), ticketOrdersInventoryChange(), enquiryReviewChange(), paymentsWebhooksChange(), ticketIssuanceChange(), crmChange(), crmReviewChange(), ticketDeliveryLeaseChange(), bookingsChange(), campaignsChange(), crmWorkflowChange(), campaignReviewChange()}
}

func bootstrapCollections() []schema.Collection {
	stringField := schema.Field("string")
	publicIDField := schema.PublicIDField()
	dateField := schema.Field("date")
	objectIDField := schema.Field("objectId")
	decimalField := schema.Field("decimal")
	boolField := schema.Field("bool")
	intField := schema.Field("int", "long")
	objectField := schema.Field("object")
	arrayField := schema.Field("array")
	withPublicID := func(required []string, properties bson.M) bson.M {
		properties["public_id"] = publicIDField
		return schema.JSONSchema(append([]string{"public_id"}, required...), properties)
	}
	idx := func(name string, unique bool, keys ...string) schema.Index {
		keyDocument := make(bson.D, 0, len(keys))
		for _, key := range keys {
			keyDocument = append(keyDocument, bson.E{Key: key, Value: 1})
		}
		return schema.Index{Name: name, Keys: keyDocument, Unique: unique}
	}
	activeUnique := func(name string, keys ...string) schema.Index {
		index := idx(name, true, keys...)
		index.Partial = bson.D{{Key: "deleted_at", Value: nil}}
		return index
	}
	paymentReferenceIndex := idx("uq_ticket_order_provider_payment_reference", true, "payment_provider", "payment_reference")
	paymentReferenceIndex.Partial = bson.D{{Key: "payment_reference", Value: bson.D{{Key: "$type", Value: "string"}}}}
	publicIndexes := func(extra ...schema.Index) []schema.Index {
		return append([]schema.Index{idx("uq_public_id", true, "public_id")}, extra...)
	}

	collections := []schema.Collection{
		{Name: "schema_changes", Validator: schema.JSONSchema([]string{"name", "checksum", "status", "claimed_at"}, bson.M{"name": stringField, "checksum": stringField, "status": stringField, "claimed_at": dateField, "applied_at": schema.Field("date", "null")}), Indexes: []schema.Index{idx("uq_change_name", true, "name")}},
		{Name: "users", Validator: withPublicID([]string{"name", "email", "role", "status", "created_at", "updated_at"}, bson.M{"name": stringField, "email": stringField, "password_hash": schema.Field("string", "null"), "role": stringField, "mfa_enabled": boolField, "status": stringField, "last_login_at": schema.Field("date", "null"), "created_at": dateField, "updated_at": dateField}), Indexes: publicIndexes(idx("uq_user_email", true, "email"), idx("ix_user_role_status", false, "role", "status"))},
		{Name: "site_settings", Validator: schema.JSONSchema([]string{"key", "value", "group", "updated_at"}, bson.M{"key": stringField, "value": objectField, "group": stringField, "updated_by": schema.Field("objectId", "null"), "updated_at": dateField}), Indexes: []schema.Index{idx("uq_setting_key", true, "key"), idx("ix_setting_group", false, "group")}},
		{Name: "pages", Validator: withPublicID([]string{"slug", "title", "status", "content", "created_at", "updated_at"}, bson.M{"slug": stringField, "title": stringField, "status": stringField, "content": objectField, "seo_title": stringField, "seo_description": stringField, "canonical_url": stringField, "social_image_asset_id": schema.Field("objectId", "null"), "published_at": schema.Field("date", "null"), "created_at": dateField, "updated_at": dateField}), Indexes: publicIndexes(idx("uq_page_slug", true, "slug"), idx("ix_page_status_published", false, "status", "published_at"))},
		{Name: "services", Validator: withPublicID([]string{"name", "slug", "active", "sort_order", "form_schema"}, bson.M{"name": stringField, "slug": stringField, "summary": stringField, "description": stringField, "category": stringField, "active": boolField, "sort_order": intField, "form_schema": objectField}), Indexes: publicIndexes(idx("uq_service_slug", true, "slug"), idx("ix_service_active_order", false, "active", "sort_order"))},
		{Name: "portfolio_items", Validator: withPublicID([]string{"title", "slug", "category", "status", "created_at", "updated_at"}, bson.M{"title": stringField, "slug": stringField, "category": stringField, "summary": stringField, "body": stringField, "client": stringField, "event_date": schema.Field("date", "null"), "role": stringField, "status": stringField, "results": objectField, "featured": boolField, "published_at": schema.Field("date", "null"), "created_at": dateField, "updated_at": dateField}), Indexes: publicIndexes(idx("uq_portfolio_slug", true, "slug"), idx("ix_portfolio_status_published", false, "status", "published_at"), idx("ix_portfolio_category_featured", false, "category", "featured"))},
		{Name: "media_assets", Validator: withPublicID([]string{"type", "storage_key", "filename", "mime_type", "bytes", "uploaded_by", "created_at"}, bson.M{"type": stringField, "storage_key": stringField, "public_url": stringField, "filename": stringField, "mime_type": stringField, "bytes": schema.Field("int", "long"), "width": intField, "height": intField, "alt_text": stringField, "tags": arrayField, "uploaded_by": objectIDField, "created_at": dateField}), Indexes: publicIndexes(idx("uq_media_storage_key", true, "storage_key"), idx("ix_media_type_created", false, "type", "created_at"))},
		{Name: "videos", Validator: withPublicID([]string{"title", "platform", "external_url", "category", "created_at"}, bson.M{"title": stringField, "platform": stringField, "external_url": stringField, "embed_url": stringField, "thumbnail_asset_id": schema.Field("objectId", "null"), "category": stringField, "featured": boolField, "published_at": schema.Field("date", "null"), "created_at": dateField}), Indexes: publicIndexes(idx("uq_video_external_url", true, "external_url"), idx("ix_video_category_published", false, "category", "published_at"))},
		{Name: "press_items", Validator: withPublicID([]string{"title", "outlet", "external_url", "type", "publish_date"}, bson.M{"title": stringField, "outlet": stringField, "external_url": stringField, "type": stringField, "publish_date": dateField, "excerpt": stringField, "image_asset_id": schema.Field("objectId", "null"), "featured": boolField}), Indexes: publicIndexes(idx("uq_press_external_url", true, "external_url"), idx("ix_press_date_featured", false, "publish_date", "featured"))},
		{Name: "testimonials", Validator: withPublicID([]string{"quote", "person_name", "approved", "created_at"}, bson.M{"quote": stringField, "person_name": stringField, "title": stringField, "organization": stringField, "image_asset_id": schema.Field("objectId", "null"), "approved": boolField, "featured": boolField, "created_at": dateField}), Indexes: publicIndexes(idx("ix_testimonial_approved_featured", false, "approved", "featured"))},
		{Name: "organizations", Validator: withPublicID([]string{"name", "normalized_name", "created_at", "updated_at"}, bson.M{"name": stringField, "normalized_name": stringField, "industry": stringField, "website": stringField, "country": stringField, "notes": stringField, "deleted_at": schema.Field("date", "null"), "created_at": dateField, "updated_at": dateField}), Indexes: publicIndexes(activeUnique("uq_active_organization_normalized_name", "normalized_name"))},
		{Name: "contacts", Validator: withPublicID([]string{"first_name", "last_name", "normalized_email", "created_at", "updated_at"}, bson.M{"organization_id": schema.Field("objectId", "null"), "first_name": stringField, "last_name": stringField, "email": stringField, "normalized_email": stringField, "phone": stringField, "job_title": stringField, "source": stringField, "tags": arrayField, "deleted_at": schema.Field("date", "null"), "created_at": dateField, "updated_at": dateField}), Indexes: publicIndexes(activeUnique("uq_active_contact_normalized_email", "normalized_email"), idx("ix_contact_organization", false, "organization_id"))},
		{Name: "enquiries", Validator: withPublicID([]string{"reference", "type", "stage", "source", "details", "consent_version", "consent_at", "source_ip_hash", "created_at", "updated_at"}, bson.M{"reference": stringField, "type": stringField, "service_id": schema.Field("objectId", "null"), "organization_id": schema.Field("objectId", "null"), "contact_id": objectIDField, "stage": stringField, "source": stringField, "budget_min": decimalField, "budget_max": decimalField, "budget_currency": stringField, "event_start_at": schema.Field("date", "null"), "event_end_at": schema.Field("date", "null"), "campaign_start_date": schema.Field("date", "null"), "campaign_end_date": schema.Field("date", "null"), "details": objectField, "consent_version": stringField, "consent_at": dateField, "source_ip_hash": stringField, "owner_id": schema.Field("objectId", "null"), "deleted_at": schema.Field("date", "null"), "created_at": dateField, "updated_at": dateField}), Indexes: publicIndexes(idx("uq_enquiry_reference", true, "reference"), idx("ix_enquiry_stage_owner_created", false, "stage", "owner_id", "created_at"), idx("ix_enquiry_contact", false, "contact_id"))},
		{Name: "enquiry_notes", Validator: withPublicID([]string{"enquiry_id", "author_id", "body", "created_at"}, bson.M{"enquiry_id": objectIDField, "author_id": objectIDField, "body": stringField, "created_at": dateField}), Indexes: publicIndexes(idx("ix_enquiry_note_created", false, "enquiry_id", "created_at"))},
		{Name: "tasks", Validator: withPublicID([]string{"title", "due_at", "status", "priority", "assignee_id", "created_at"}, bson.M{"title": stringField, "due_at": dateField, "status": stringField, "priority": stringField, "assignee_id": objectIDField, "enquiry_id": schema.Field("objectId", "null"), "campaign_id": schema.Field("objectId", "null"), "booking_id": schema.Field("objectId", "null"), "created_at": dateField}), Indexes: publicIndexes(idx("ix_task_assignee_status_due", false, "assignee_id", "status", "due_at"))},
		{Name: "bookings", Validator: withPublicID([]string{"title", "start_at", "end_at", "status", "currency", "created_at", "updated_at"}, bson.M{"enquiry_id": schema.Field("objectId", "null"), "title": stringField, "service_id": schema.Field("objectId", "null"), "start_at": dateField, "end_at": dateField, "venue": stringField, "city": stringField, "country": stringField, "status": stringField, "fee": decimalField, "currency": stringField, "requirements": objectField, "deleted_at": schema.Field("date", "null"), "created_at": dateField, "updated_at": dateField}), Indexes: publicIndexes(idx("ix_booking_dates_status", false, "start_at", "end_at", "status"), idx("ix_booking_enquiry", false, "enquiry_id"))},
		{Name: "campaigns", Validator: withPublicID([]string{"organization_id", "title", "status", "currency", "created_at", "updated_at"}, bson.M{"enquiry_id": schema.Field("objectId", "null"), "organization_id": objectIDField, "title": stringField, "objective": stringField, "start_date": dateField, "end_date": dateField, "status": stringField, "fee": decimalField, "currency": stringField, "expenses": decimalField, "results": objectField, "deleted_at": schema.Field("date", "null"), "created_at": dateField, "updated_at": dateField}), Indexes: publicIndexes(idx("ix_campaign_organization_status", false, "organization_id", "status"), idx("ix_campaign_dates", false, "start_date", "end_date"))},
		{Name: "deliverables", Validator: withPublicID([]string{"campaign_id", "title", "platform", "format", "due_at", "status"}, bson.M{"campaign_id": objectIDField, "title": stringField, "platform": stringField, "format": stringField, "due_at": dateField, "status": stringField, "published_url": stringField, "approval_status": stringField}), Indexes: publicIndexes(idx("ix_deliverable_campaign_status", false, "campaign_id", "status"), idx("ix_deliverable_due", false, "due_at"))},
		{Name: "audience_metrics", Validator: withPublicID([]string{"platform", "metric_date", "created_at"}, bson.M{"platform": stringField, "metric_date": dateField, "followers": intField, "reach": intField, "impressions": intField, "engagement_rate": decimalField, "audience": objectField, "created_at": dateField}), Indexes: publicIndexes(idx("uq_audience_platform_date", true, "platform", "metric_date"))},
		{Name: "audit_logs", Validator: withPublicID([]string{"action", "entity_type", "entity_id", "metadata", "created_at"}, bson.M{"actor_id": schema.Field("objectId", "null"), "action": stringField, "entity_type": stringField, "entity_id": stringField, "metadata": objectField, "created_at": dateField}), Indexes: publicIndexes(idx("ix_audit_actor_created", false, "actor_id", "created_at"), idx("ix_audit_entity_created", false, "entity_type", "entity_id", "created_at"))},
		{Name: "events", Validator: withPublicID([]string{"title", "slug", "timezone", "starts_at", "ends_at", "status", "capacity", "sales_start_at", "sales_end_at", "created_at", "updated_at"}, bson.M{"title": stringField, "slug": stringField, "summary": stringField, "description": stringField, "banner_asset_id": schema.Field("objectId", "null"), "venue": stringField, "address": stringField, "city": stringField, "country": stringField, "timezone": stringField, "starts_at": dateField, "ends_at": dateField, "doors_open_at": schema.Field("date", "null"), "status": stringField, "capacity": intField, "sales_start_at": dateField, "sales_end_at": dateField, "terms": stringField, "refund_policy": stringField, "featured": boolField, "published_at": schema.Field("date", "null"), "created_at": dateField, "updated_at": dateField}), Indexes: publicIndexes(idx("uq_event_slug", true, "slug"), idx("ix_event_dates_status", false, "starts_at", "ends_at", "status"), idx("ix_event_featured_published", false, "featured", "published_at"))},
		{Name: "ticket_types", Validator: withPublicID([]string{"event_id", "name", "price", "currency", "quantity_total", "quantity_reserved", "quantity_sold", "min_per_order", "max_per_order", "status"}, bson.M{"event_id": objectIDField, "name": stringField, "description": stringField, "price": decimalField, "currency": stringField, "quantity_total": intField, "quantity_reserved": intField, "quantity_sold": intField, "min_per_order": intField, "max_per_order": intField, "sales_start_at": dateField, "sales_end_at": dateField, "status": stringField, "sort_order": intField}), Indexes: publicIndexes(idx("uq_ticket_type_event_name", true, "event_id", "name"), idx("ix_ticket_type_event_status_order", false, "event_id", "status", "sort_order"))},
		{Name: "ticket_orders", Validator: withPublicID([]string{"reference", "event_id", "buyer_name", "buyer_email", "currency", "subtotal", "fees", "total", "status", "idempotency_key", "hold_expires_at", "created_at", "updated_at"}, bson.M{"reference": stringField, "event_id": objectIDField, "buyer_name": stringField, "buyer_email": stringField, "buyer_phone": stringField, "currency": stringField, "subtotal": decimalField, "fees": decimalField, "total": decimalField, "status": stringField, "payment_provider": stringField, "payment_reference": stringField, "idempotency_key": stringField, "hold_expires_at": dateField, "paid_at": schema.Field("date", "null"), "refunded_at": schema.Field("date", "null"), "created_at": dateField, "updated_at": dateField}), Indexes: publicIndexes(idx("uq_ticket_order_reference", true, "reference"), idx("uq_ticket_order_idempotency", true, "idempotency_key"), paymentReferenceIndex, idx("ix_ticket_order_event_status_created", false, "event_id", "status", "created_at"), idx("ix_ticket_order_hold_expiry", false, "status", "hold_expires_at"))},
		{Name: "ticket_order_items", Validator: withPublicID([]string{"order_id", "ticket_type_id", "quantity", "unit_price", "line_total"}, bson.M{"order_id": objectIDField, "ticket_type_id": objectIDField, "quantity": intField, "unit_price": decimalField, "line_total": decimalField}), Indexes: publicIndexes(idx("ix_order_item_order", false, "order_id"), idx("ix_order_item_ticket_type", false, "ticket_type_id"))},
		{Name: "issued_tickets", Validator: withPublicID([]string{"order_id", "order_item_id", "event_id", "ticket_type_id", "qr_token_hash", "status", "created_at"}, bson.M{"order_id": objectIDField, "order_item_id": objectIDField, "event_id": objectIDField, "ticket_type_id": objectIDField, "attendee_name": schema.Field("string", "null"), "qr_token_hash": stringField, "status": stringField, "checked_in_at": schema.Field("date", "null"), "checked_in_by": schema.Field("objectId", "null"), "voided_at": schema.Field("date", "null"), "created_at": dateField}), Indexes: publicIndexes(idx("uq_ticket_qr_hash", true, "qr_token_hash"), idx("ix_ticket_event_status", false, "event_id", "status"), idx("ix_ticket_order", false, "order_id"))},
		{Name: "payment_webhooks", Validator: withPublicID([]string{"provider", "external_event_id", "event_type", "signature_valid", "payload_hash", "processing_status", "created_at"}, bson.M{"provider": stringField, "external_event_id": stringField, "event_type": stringField, "signature_valid": boolField, "payload_hash": stringField, "processing_status": stringField, "processed_at": schema.Field("date", "null"), "created_at": dateField}), Indexes: publicIndexes(idx("uq_webhook_provider_event", true, "provider", "external_event_id"), idx("ix_webhook_status_created", false, "processing_status", "created_at"))},
		{Name: "ticket_check_ins", Validator: withPublicID([]string{"ticket_id", "event_id", "checked_in_by", "result", "created_at"}, bson.M{"ticket_id": objectIDField, "event_id": objectIDField, "checked_in_by": objectIDField, "device_label": schema.Field("string", "null"), "result": stringField, "created_at": dateField}), Indexes: publicIndexes(idx("ix_checkin_ticket_created", false, "ticket_id", "created_at"), idx("ix_checkin_event_created", false, "event_id", "created_at"))},
		{Name: "seed_runs", Validator: schema.JSONSchema([]string{"name", "environment", "checksum", "status", "claimed_at"}, bson.M{"name": stringField, "environment": stringField, "checksum": stringField, "status": stringField, "claimed_at": dateField, "applied_at": schema.Field("date", "null")}), Indexes: []schema.Index{idx("uq_seed_name_environment", true, "name", "environment")}},
	}

	return collections
}
