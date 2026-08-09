package changes

import (
	"context"
	"reflect"
	"testing"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

func TestBootstrapSpecsAreValidAndComplete(t *testing.T) {
	t.Parallel()

	collections := bootstrapCollections()
	if err := schema.ValidateSpecs(collections); err != nil {
		t.Fatalf("ValidateSpecs() error = %v", err)
	}

	requiredCollections := []string{
		"users", "site_settings", "pages", "services", "portfolio_items", "media_assets", "videos",
		"press_items", "testimonials", "organizations", "contacts", "enquiries", "enquiry_notes", "tasks",
		"bookings", "campaigns", "deliverables", "audience_metrics", "audit_logs", "events", "ticket_types",
		"ticket_orders", "ticket_order_items", "issued_tickets", "payment_webhooks", "ticket_check_ins",
		"schema_changes", "seed_runs",
	}
	found := make(map[string]schema.Collection, len(collections))
	for _, collection := range collections {
		found[collection.Name] = collection
	}
	for _, name := range requiredCollections {
		if _, exists := found[name]; !exists {
			t.Errorf("required collection %q missing", name)
		}
	}
	if len(found) != len(requiredCollections) {
		t.Errorf("collection count = %d, want %d", len(found), len(requiredCollections))
	}

	assertIndex(t, found["enquiries"], "ix_enquiry_stage_owner_created")
	assertIndex(t, found["events"], "ix_event_dates_status")
	assertIndex(t, found["contacts"], "uq_active_contact_normalized_email")
	assertIndex(t, found["organizations"], "uq_active_organization_normalized_name")
	assertIndex(t, found["ticket_orders"], "uq_ticket_order_idempotency")
	assertIndex(t, found["ticket_orders"], "uq_ticket_order_provider_payment_reference")
	assertIndex(t, found["payment_webhooks"], "uq_webhook_provider_event")
	assertIndex(t, found["issued_tickets"], "uq_ticket_qr_hash")
}

func TestExternalAndInternalIdentifiersAreConstrained(t *testing.T) {
	t.Parallel()

	for _, collection := range bootstrapCollections() {
		jsonSchema := collection.Validator["$jsonSchema"].(bson.M)
		properties := jsonSchema["properties"].(bson.M)
		if properties["_id"].(bson.M)["bsonType"] != "objectId" {
			t.Errorf("%s._id is not constrained to ObjectId", collection.Name)
		}
		publicID, exposed := properties["public_id"]
		if exposed && publicID.(bson.M)["pattern"] == "" {
			t.Errorf("%s.public_id has no UUID pattern", collection.Name)
		}
	}
}

func TestSpecificationFieldsAndPartialIndexesArePresent(t *testing.T) {
	t.Parallel()

	collections := make(map[string]schema.Collection)
	for _, collection := range bootstrapCollections() {
		collections[collection.Name] = collection
	}
	for collectionName, fields := range map[string][]string{
		"pages":           {"seo_title", "seo_description", "canonical_url", "social_image_asset_id"},
		"portfolio_items": {"summary", "body", "client", "event_date", "role"},
		"enquiries":       {"budget_currency", "event_start_at", "event_end_at", "campaign_start_date", "campaign_end_date"},
	} {
		properties := collections[collectionName].Validator["$jsonSchema"].(bson.M)["properties"].(bson.M)
		for _, field := range fields {
			if _, exists := properties[field]; !exists {
				t.Errorf("%s.%s is missing", collectionName, field)
			}
		}
	}

	for collectionName, indexName := range map[string]string{
		"organizations": "uq_active_organization_normalized_name",
		"contacts":      "uq_active_contact_normalized_email",
		"ticket_orders": "uq_ticket_order_provider_payment_reference",
	} {
		for _, index := range collections[collectionName].Indexes {
			if index.Name == indexName && len(index.Partial) == 0 {
				t.Errorf("%s.%s has no partial filter", collectionName, indexName)
			}
		}
	}
}

func TestMoneyFieldsRequireDecimal128(t *testing.T) {
	t.Parallel()

	collections := make(map[string]schema.Collection)
	for _, collection := range bootstrapCollections() {
		collections[collection.Name] = collection
	}

	for collectionName, fields := range map[string][]string{
		"enquiries":          {"budget_min", "budget_max"},
		"bookings":           {"fee"},
		"campaigns":          {"fee", "expenses"},
		"ticket_types":       {"price"},
		"ticket_orders":      {"subtotal", "fees", "total"},
		"ticket_order_items": {"unit_price", "line_total"},
	} {
		jsonSchema := collections[collectionName].Validator["$jsonSchema"].(bson.M)
		properties := jsonSchema["properties"].(bson.M)
		for _, field := range fields {
			specification := properties[field].(bson.M)
			if specification["bsonType"] != "decimal" {
				t.Errorf("%s.%s bsonType = %v, want decimal", collectionName, field, specification["bsonType"])
			}
		}
	}
}

func TestRegistryHasStableChecksum(t *testing.T) {
	t.Parallel()

	registry := Registry()
	if len(registry) != 35 {
		t.Fatalf("Registry() length = %d, want 35", len(registry))
	}
	// The newest change must stay last: Apply runs the registry in order, and a
	// change that evolves a collection has to follow the one that created it.
	last := registry[len(registry)-1]
	if last.Name != aboutPageSectionsChangeName || len(last.Checksum) != 64 {
		t.Fatalf("unexpected final registry entry: %#v", last)
	}
	if registry[0].Name != bootstrapChangeName || len(registry[0].Checksum) != 64 {
		t.Fatalf("unexpected registry entry: name=%q checksum=%q", registry[0].Name, registry[0].Checksum)
	}
	if registry[2].Name != siteSettingsChangeName || len(registry[2].Checksum) != 64 {
		t.Fatalf("unexpected settings registry entry: %#v", registry[2])
	}
	if registry[3].Name != mediaAssetsChangeName || len(registry[3].Checksum) != 64 {
		t.Fatalf("unexpected media registry entry: %#v", registry[3])
	}
	if registry[4].Name != exactGlobalSettingsChangeName || len(registry[4].Checksum) != 64 || len(registry[4].Supersedes) != 1 || registry[4].Supersedes[0] != siteSettingsChangeName {
		t.Fatalf("unexpected exact-settings registry entry: %#v", registry[4])
	}
	if registry[5].Name != exactMediaAssetsChangeName || len(registry[5].Checksum) != 64 || len(registry[5].Supersedes) != 1 || registry[5].Supersedes[0] != mediaAssetsChangeName {
		t.Fatalf("unexpected exact-media registry entry: %#v", registry[5])
	}
	if registry[6].Name != servicesChangeName || len(registry[6].Checksum) != 64 {
		t.Fatalf("unexpected services registry entry: %#v", registry[6])
	}
	if registry[7].Name != contentChangeName || len(registry[7].Checksum) != 64 || !reflect.DeepEqual(registry[7].EvolvesCollections, []string{"pages", "portfolio_items", "videos", "press_items", "testimonials"}) {
		t.Fatalf("unexpected content registry entry: %#v", registry[7])
	}
	if registry[8].Name != serviceLifecycleChangeName || len(registry[8].Checksum) != 64 || !reflect.DeepEqual(registry[8].Supersedes, []string{servicesChangeName}) || !reflect.DeepEqual(registry[8].EvolvesCollections, []string{"services"}) {
		t.Fatalf("unexpected service lifecycle registry entry: %#v", registry[8])
	}
	if registry[9].Name != contentRevisionChangeName || len(registry[9].Checksum) != 64 || !reflect.DeepEqual(registry[9].Supersedes, []string{contentChangeName}) || !reflect.DeepEqual(registry[9].EvolvesCollections, []string{"pages", "portfolio_items", "videos", "press_items", "testimonials"}) {
		t.Fatalf("unexpected content revision registry entry: %#v", registry[9])
	}
	if registry[10].Name != eventsTicketTypesChangeName || len(registry[10].Checksum) != 64 || !reflect.DeepEqual(registry[10].EvolvesCollections, []string{"events", "ticket_types"}) {
		t.Fatalf("unexpected events registry entry: %#v", registry[10])
	}
	if registry[11].Name != eventValidationChangeName || len(registry[11].Checksum) != 64 || !reflect.DeepEqual(registry[11].Supersedes, []string{eventsTicketTypesChangeName}) || !reflect.DeepEqual(registry[11].EvolvesCollections, []string{"events", "ticket_types"}) {
		t.Fatalf("unexpected event validation registry entry: %#v", registry[11])
	}
	if registry[12].Name != enquiriesOutboxChangeName || len(registry[12].Checksum) != 64 || !reflect.DeepEqual(registry[12].EvolvesCollections, []string{"enquiries", "enquiry_idempotency", "notification_outbox"}) {
		t.Fatalf("unexpected enquiries registry entry: %#v", registry[12])
	}
	if registry[13].Name != ticketOrdersInventoryChangeName || len(registry[13].Checksum) != 64 || !reflect.DeepEqual(registry[13].EvolvesCollections, []string{"ticket_orders", "ticket_order_items"}) {
		t.Fatalf("unexpected ticket-order registry entry: %#v", registry[13])
	}
	if registry[14].Name != enquiryReviewChangeName || len(registry[14].Checksum) != 64 || !reflect.DeepEqual(registry[14].Supersedes, []string{enquiriesOutboxChangeName}) {
		t.Fatalf("unexpected enquiry review registry entry: %#v", registry[14])
	}
	if registry[16].Name != ticketIssuanceChangeName || len(registry[16].Checksum) != 64 || !reflect.DeepEqual(registry[16].Supersedes, []string{paymentsWebhooksChangeName}) {
		t.Fatalf("unexpected ticket issuance registry entry: %#v", registry[16])
	}
	if registry[17].Name != crmChangeName || len(registry[17].Checksum) != 64 || !reflect.DeepEqual(registry[17].EvolvesCollections, []string{"organizations", "contacts"}) {
		t.Fatalf("unexpected CRM registry entry: %#v", registry[17])
	}
	if registry[18].Name != crmReviewChangeName || len(registry[18].Checksum) != 64 || !reflect.DeepEqual(registry[18].Supersedes, []string{crmChangeName}) || !reflect.DeepEqual(registry[18].EvolvesCollections, []string{"organizations", "contacts", "crm_enquiries", "crm_saved_views"}) {
		t.Fatalf("unexpected CRM review registry entry: %#v", registry[18])
	}
	if registry[19].Name != ticketDeliveryLeaseChangeName || len(registry[19].Checksum) != 64 || !reflect.DeepEqual(registry[19].Supersedes, []string{ticketIssuanceChangeName}) || !reflect.DeepEqual(registry[19].EvolvesCollections, []string{"ticket_delivery_outbox"}) {
		t.Fatalf("unexpected ticket delivery lease registry entry: %#v", registry[19])
	}
	if registry[20].Name != bookingsChangeName || len(registry[20].Checksum) != 64 || !reflect.DeepEqual(registry[20].EvolvesCollections, []string{"bookings"}) {
		t.Fatalf("unexpected bookings registry entry: %#v", registry[20])
	}
	if registry[21].Name != campaignsChangeName || len(registry[21].Checksum) != 64 || !reflect.DeepEqual(registry[21].EvolvesCollections, []string{"campaigns"}) {
		t.Fatalf("unexpected campaigns registry entry: %#v", registry[21])
	}
	if registry[22].Name != crmWorkflowChangeName || len(registry[22].Checksum) != 64 || len(registry[22].EvolvesCollections) != 0 {
		t.Fatalf("unexpected CRM workflow registry entry: %#v", registry[22])
	}
	if registry[23].Name != campaignReviewChangeName || len(registry[23].Checksum) != 64 || !reflect.DeepEqual(registry[23].Supersedes, []string{campaignsChangeName}) || !reflect.DeepEqual(registry[23].EvolvesCollections, []string{"campaigns", "deliverables", "campaign_deliverables"}) {
		t.Fatalf("unexpected campaign review registry entry: %#v", registry[23])
	}
	if registry[24].Name != crmWorkflowReviewChangeName || len(registry[24].Checksum) != 64 || !reflect.DeepEqual(registry[24].Supersedes, []string{crmWorkflowChangeName}) || !reflect.DeepEqual(registry[24].EvolvesCollections, []string{"enquiry_notes", "tasks", "crm_enquiry_notes", "crm_tasks"}) {
		t.Fatalf("unexpected CRM workflow review registry entry: %#v", registry[24])
	}
	if registry[25].Name != auditExportIndexesChangeName || len(registry[25].Checksum) != 64 || !reflect.DeepEqual(registry[25].EvolvesCollections, []string{"audit_logs"}) {
		t.Fatalf("unexpected audit export indexes registry entry: %#v", registry[25])
	}
	if registry[26].Name != conversionEventsChangeName || len(registry[26].Checksum) != 64 {
		t.Fatalf("unexpected conversion events registry entry: %#v", registry[26])
	}
	if registry[27].Name != privacyHoldsChangeName || len(registry[27].Checksum) != 64 {
		t.Fatalf("unexpected privacy holds registry entry: %#v", registry[27])
	}
	if registry[28].Name != ticketOperationsChangeName || len(registry[28].Checksum) != 64 || !reflect.DeepEqual(registry[28].EvolvesCollections, []string{"ticket_orders", "issued_tickets"}) {
		t.Fatalf("unexpected ticket operations registry entry: %#v", registry[28])
	}
	if registry[29].Name != checkinChangeName || len(registry[29].Checksum) != 64 || !reflect.DeepEqual(registry[29].EvolvesCollections, []string{"ticket_check_ins"}) {
		t.Fatalf("unexpected check-in registry entry: %#v", registry[29])
	}
	if registry[30].Name != staffAccountSurfacesChangeName || len(registry[30].Checksum) != 64 {
		t.Fatalf("unexpected staff account surfaces registry entry: %#v", registry[30])
	}
}

func TestCRMWorkflowSchemasAreClosedAndIndexed(t *testing.T) {
	want := map[string]string{"crm_enquiry_notes": "ix_note_enquiry_created", "crm_tasks": "ix_task_overdue_reminder", "crm_stage_history": "ix_stage_history_enquiry_created", "crm_proposal_attachments": "uq_proposal_enquiry_asset", "crm_notification_deliveries": "ix_crm_delivery_due"}
	for _, collection := range exactCRMWorkflowCollections() {
		if collection.Validator["$jsonSchema"].(bson.M)["additionalProperties"] != false {
			t.Fatalf("%s validator is open", collection.Name)
		}
		found := false
		for _, index := range collection.Indexes {
			if index.Name == want[collection.Name] {
				found = true
			}
		}
		if !found {
			t.Fatalf("%s missing %s", collection.Name, want[collection.Name])
		}
		delete(want, collection.Name)
	}
	if len(want) != 0 {
		t.Fatalf("missing workflow collections: %#v", want)
	}
}

func TestCRMSchemasAreClosedAndPreserveSourceEnquiries(t *testing.T) {
	collections := map[string]schema.Collection{}
	for _, collection := range exactCRMCollections() {
		collections[collection.Name] = collection
		if collection.Validator["$jsonSchema"].(bson.M)["additionalProperties"] != false {
			t.Fatalf("%s schema is not closed", collection.Name)
		}
	}
	if _, exists := collections["enquiries"]; exists {
		t.Fatal("JK-010 must not redefine JK-009 enquiries")
	}
	want := map[string][]string{"organizations": {"public_id", "name", "deleted_at"}, "contacts": {"organization_id", "normalized_email", "normalized_phone", "deleted_at"}, "crm_enquiries": {"source_enquiry_id", "owner_id", "stage", "source", "deleted_at"}, "crm_saved_views": {"owner_id", "name", "filter"}}
	for name, fields := range want {
		properties := collections[name].Validator["$jsonSchema"].(bson.M)["properties"].(bson.M)
		for _, field := range fields {
			if _, exists := properties[field]; !exists {
				t.Fatalf("%s schema omits %s", name, field)
			}
		}
		if len(collections[name].Indexes) < 2 {
			t.Fatalf("%s indexes incomplete", name)
		}
	}
	filter := collections["crm_saved_views"].Validator["$jsonSchema"].(bson.M)["properties"].(bson.M)["filter"].(bson.M)
	if filter["additionalProperties"] != false {
		t.Fatal("saved-view filter is not closed")
	}
	wantStages := bson.A{"new", "reviewing", "qualified", "call_scheduled", "proposal_sent", "negotiation", "won", "lost", "archived"}
	properties := collections["crm_enquiries"].Validator["$jsonSchema"].(bson.M)["properties"].(bson.M)
	if got := properties["stage"].(bson.M)["enum"]; !reflect.DeepEqual(got, wantStages) {
		t.Fatalf("CRM stage enum = %#v, want %#v", got, wantStages)
	}
	filterStages := filter["properties"].(bson.M)["stages"].(bson.M)["items"].(bson.M)["enum"]
	if !reflect.DeepEqual(filterStages, wantStages) {
		t.Fatalf("saved-view stage enum = %#v, want %#v", filterStages, wantStages)
	}
}

func TestEventSchemasAreClosedAndCoverRepositoryFields(t *testing.T) {
	collections := map[string]schema.Collection{}
	for _, collection := range exactEventCollections() {
		collections[collection.Name] = collection
		if collection.Validator["$jsonSchema"].(bson.M)["additionalProperties"] != false {
			t.Fatalf("%s schema is not closed", collection.Name)
		}
	}
	want := map[string][]string{
		"events":       {"public_id", "slug", "venue", "policies", "ticket_capacity_allocated", "banner", "published_at", "cancelled_at"},
		"ticket_types": {"public_id", "event_id", "price", "sold", "reserved", "sales_start", "sales_end", "paused"},
	}
	for name, fields := range want {
		properties := collections[name].Validator["$jsonSchema"].(bson.M)["properties"].(bson.M)
		for _, field := range fields {
			if _, exists := properties[field]; !exists {
				t.Fatalf("%s schema omits %s", name, field)
			}
		}
	}
}

func TestContentRevisionSchemasAreClosedAndRevisioned(t *testing.T) {
	for _, collection := range revisionContentCollections() {
		jsonSchema := collection.Validator["$jsonSchema"].(bson.M)
		if jsonSchema["additionalProperties"] != false {
			t.Fatalf("%s schema is not closed", collection.Name)
		}
		if _, exists := jsonSchema["properties"].(bson.M)["revision"]; !exists {
			t.Fatalf("%s schema omits revision", collection.Name)
		}
	}
}

func TestServiceLifecycleSchemaIsClosedAndCoversRepositoryFields(t *testing.T) {
	collection := lifecycleServicesCollection()
	jsonSchema, ok := collection.Validator["$jsonSchema"].(bson.M)
	if !ok || jsonSchema["additionalProperties"] != false {
		t.Fatalf("services top-level schema is not closed: %#v", collection.Validator)
	}
	properties := jsonSchema["properties"].(bson.M)
	for _, field := range []string{"_id", "public_id", "name", "slug", "summary", "description", "category", "active", "version", "retired_at", "sort_order", "form_schema", "cta", "created_at", "updated_at"} {
		if _, exists := properties[field]; !exists {
			t.Fatalf("services schema omits repository field %q", field)
		}
	}
}

func TestContentSchemasAreExactAndCoverRepositoryFields(t *testing.T) {
	collections := map[string]schema.Collection{}
	for _, collection := range exactContentCollections() {
		collections[collection.Name] = collection
	}
	want := map[string][]string{
		"pages": {"slug", "body"}, "portfolio_items": {"slug", "body", "category", "results"},
		"videos": {"body", "category", "external_url", "embed_url"}, "press_items": {"body", "category", "external_url", "outlet"},
		"testimonials": {"body", "person_name", "person_title", "organization"},
	}
	for name, kindFields := range want {
		collection, ok := collections[name]
		if !ok {
			t.Fatalf("missing content collection %s", name)
		}
		jsonSchema := collection.Validator["$jsonSchema"].(bson.M)
		if jsonSchema["additionalProperties"] != false {
			t.Errorf("%s is not exact", name)
		}
		properties := jsonSchema["properties"].(bson.M)
		for _, field := range append([]string{"_id", "public_id", "title", "summary", "tags", "featured", "gallery_asset_ids", "seo", "status", "approved", "publish_at", "unpublish_at", "published_at", "created_at", "updated_at"}, kindFields...) {
			if _, exists := properties[field]; !exists {
				t.Errorf("%s missing %s", name, field)
			}
		}
		indexes := map[string]bool{}
		for _, index := range collection.Indexes {
			indexes[index.Name] = true
		}
		for _, index := range []string{"uq_public_id", "ix_content_publication"} {
			if !indexes[index] {
				t.Errorf("%s missing %s", name, index)
			}
		}
	}
}

func TestRegistryRejectsInvalidSupersession(t *testing.T) {
	base := Change{Name: "first", Checksum: "checksum", Apply: func(context.Context, *mongo.Database) error { return nil }, Verify: func(context.Context, *mongo.Database) error { return nil }}
	unknown := base
	unknown.Name = "second"
	unknown.Supersedes = []string{"missing"}
	if err := validateRegistry([]Change{base, unknown}); err == nil {
		t.Fatal("unknown superseded change accepted")
	}
	later := base
	later.Name = "later"
	base.Supersedes = []string{"later"}
	if err := validateRegistry([]Change{base, later}); err == nil {
		t.Fatal("later superseded change accepted")
	}
	base.Supersedes = []string{"first"}
	if err := validateRegistry([]Change{base}); err == nil {
		t.Fatal("self-superseded change accepted")
	}
}

func TestRegistryRejectsInvalidEvolvedCollectionMetadata(t *testing.T) {
	base := Change{Name: "first", Checksum: "checksum", Apply: func(context.Context, *mongo.Database) error { return nil }, Verify: func(context.Context, *mongo.Database) error { return nil }}
	base.EvolvesCollections = []string{"pages", "pages"}
	if err := validateRegistry([]Change{base}); err == nil {
		t.Fatal("duplicate evolved collection accepted")
	}
	base.EvolvesCollections = []string{""}
	if err := validateRegistry([]Change{base}); err == nil {
		t.Fatal("empty evolved collection accepted")
	}
}

func TestMediaSchemaHasReplayAndUsageUniqueness(t *testing.T) {
	collections := map[string]schema.Collection{}
	for _, collection := range mediaAssetCollections() {
		collections[collection.Name] = collection
	}
	for collection, index := range map[string]string{"media_usage_references": "uq_media_usage_reference", "media_callback_events": "uq_media_provider_event"} {
		found := false
		for _, candidate := range collections[collection].Indexes {
			if candidate.Name == index && candidate.Unique {
				found = true
			}
		}
		if !found {
			t.Errorf("%s missing unique %s", collection, index)
		}
	}
}

func TestExactMediaSchemaCoversRepositoryFieldsAndStateIndexes(t *testing.T) {
	collection := exactMediaAssetsCollection()
	jsonSchema := collection.Validator["$jsonSchema"].(bson.M)
	properties := jsonSchema["properties"].(bson.M)
	for _, field := range []string{"folder", "transformations", "provider_version", "status", "updated_at", "reference_version"} {
		if _, ok := properties[field]; !ok {
			t.Errorf("media_assets validator missing repository field %q", field)
		}
	}
	indexes := map[string]bool{}
	for _, index := range collection.Indexes {
		indexes[index.Name] = true
	}
	for _, name := range []string{"uq_public_id", "uq_media_storage_key", "ix_media_type_created", "ix_media_status_updated", "ix_media_folder_status_created"} {
		if !indexes[name] {
			t.Errorf("media_assets missing index %q", name)
		}
	}
}

func TestExactServicesSchemaCoversLifecycleFormsAndCTA(t *testing.T) {
	collection := exactServicesCollection()
	jsonSchema := collection.Validator["$jsonSchema"].(bson.M)
	properties := jsonSchema["properties"].(bson.M)
	for _, field := range []string{"slug", "active", "sort_order", "form_schema", "cta", "created_at", "updated_at"} {
		if _, ok := properties[field]; !ok {
			t.Errorf("services validator missing field %q", field)
		}
	}
	form := properties["form_schema"].(bson.M)
	if form["additionalProperties"] != false {
		t.Fatal("form_schema permits unknown fields")
	}
	cta := properties["cta"].(bson.M)
	href := cta["properties"].(bson.M)["href"].(bson.M)
	if len(href["enum"].(bson.A)) != 1 || href["enum"].(bson.A)[0] != "/book" {
		t.Fatalf("CTA href is not fixed to /book: %#v", href)
	}
}

func TestGlobalSettingsSchemaSupportsVersionedPublication(t *testing.T) {
	change := siteSettingsChange()
	if change.Name != "202608051430_jk005_global_settings" {
		t.Fatalf("change name = %q", change.Name)
	}
	if change.Apply == nil || change.Verify == nil {
		t.Fatal("settings change lacks apply or verify")
	}
}

func TestChecksumChangesWithSchema(t *testing.T) {
	t.Parallel()

	collections := bootstrapCollections()
	original, err := schema.CanonicalChecksum(collections)
	if err != nil {
		t.Fatal(err)
	}
	collections[0].Indexes[0].Unique = !collections[0].Indexes[0].Unique
	changed, err := schema.CanonicalChecksum(collections)
	if err != nil {
		t.Fatal(err)
	}
	if original == changed {
		t.Fatal("CanonicalChecksum() did not change after index option mutation")
	}
}

func assertIndex(t *testing.T, collection schema.Collection, name string) {
	t.Helper()
	for _, index := range collection.Indexes {
		if index.Name == name {
			return
		}
	}
	t.Errorf("collection %q missing index %q", collection.Name, name)
}
