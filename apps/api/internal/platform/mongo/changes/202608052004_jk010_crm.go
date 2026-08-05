package changes

import (
	"context"
	"fmt"
	"strings"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const crmChangeName = "202608052004_jk010_crm"

func crmChange() Change {
	collections := exactCRMCollections()
	evolves := []string{"organizations", "contacts"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{Name: crmChangeName, Checksum: Checksum(canonical + "|evolves=" + strings.Join(evolves, ",")), EvolvesCollections: evolves, Apply: func(ctx context.Context, db *mongo.Database) error {
		if err := evolveCRMCollections(ctx, db); err != nil {
			return err
		}
		if err := schema.Apply(ctx, db, collections); err != nil {
			return err
		}
		for _, collection := range collections {
			command := bson.D{{Key: "collMod", Value: collection.Name}, {Key: "validationLevel", Value: "strict"}, {Key: "validationAction", Value: "error"}}
			if err := db.RunCommand(ctx, command).Err(); err != nil {
				return fmt.Errorf("enforce %s validation: %w", collection.Name, err)
			}
		}
		return nil
	}, Verify: func(ctx context.Context, db *mongo.Database) error { return schema.Verify(ctx, db, collections) }}
}

func exactCRMCollections() []schema.Collection {
	str, date := schema.Field("string"), schema.Field("date")
	nullDate := schema.Field("date", "null")
	closed := func(required []string, properties bson.M) bson.M {
		properties["_id"] = schema.Field("objectId")
		return bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": append([]string{"_id"}, required...), "properties": properties, "additionalProperties": false}}
	}
	idx := func(name string, unique bool, keys ...string) schema.Index {
		d := bson.D{}
		for _, key := range keys {
			d = append(d, bson.E{Key: key, Value: 1})
		}
		return schema.Index{Name: name, Keys: d, Unique: unique}
	}
	active := func(index schema.Index, field string) schema.Index {
		index.Partial = bson.D{{Key: field, Value: bson.D{{Key: "$gt", Value: ""}}}, {Key: "deleted_at", Value: nil}}
		return index
	}
	public := func(extra ...schema.Index) []schema.Index {
		return append([]schema.Index{idx("uq_public_id", true, "public_id")}, extra...)
	}
	stages := bson.A{"new", "reviewing", "qualified", "call_scheduled", "proposal_sent", "negotiation", "won", "lost", "archived"}
	filter := bson.M{"bsonType": "object", "required": bson.A{"stages", "owner_id", "sources", "service_id", "organization_id", "query", "include_deleted"}, "additionalProperties": false, "properties": bson.M{"stages": bson.M{"bsonType": bson.A{"array", "null"}, "items": bson.M{"bsonType": "string", "enum": stages}}, "owner_id": str, "sources": bson.M{"bsonType": bson.A{"array", "null"}, "items": str}, "service_id": str, "organization_id": str, "query": str, "include_deleted": schema.Field("bool")}}
	return []schema.Collection{
		{Name: "organizations", Validator: closed([]string{"public_id", "name", "normalized_name", "website", "country_code", "created_at", "updated_at"}, bson.M{"public_id": schema.PublicIDField(), "name": bson.M{"bsonType": "string", "minLength": 2, "maxLength": 160}, "normalized_name": bson.M{"bsonType": "string", "minLength": 2, "maxLength": 160}, "website": bson.M{"bsonType": "string", "maxLength": 2048}, "country_code": bson.M{"bsonType": "string", "pattern": `^$|^[A-Z]{2}$`}, "deleted_at": nullDate, "created_at": date, "updated_at": date}), Indexes: public(active(idx("uq_active_organization_normalized_name", true, "normalized_name"), "normalized_name"))},
		{Name: "contacts", Validator: closed([]string{"public_id", "organization_id", "name", "email", "phone", "role", "country_code", "normalized_email", "normalized_phone", "created_at", "updated_at"}, bson.M{"public_id": schema.PublicIDField(), "organization_id": bson.M{"bsonType": "string", "pattern": `^$|^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`}, "name": bson.M{"bsonType": "string", "minLength": 2, "maxLength": 120}, "email": bson.M{"bsonType": "string", "maxLength": 254}, "phone": bson.M{"bsonType": "string", "maxLength": 20}, "role": bson.M{"bsonType": "string", "maxLength": 120}, "country_code": bson.M{"bsonType": "string", "pattern": `^$|^[A-Z]{2}$`}, "normalized_email": bson.M{"bsonType": "string", "maxLength": 254}, "normalized_phone": bson.M{"bsonType": "string", "maxLength": 20}, "deleted_at": nullDate, "created_at": date, "updated_at": date}), Indexes: public(active(idx("uq_active_contact_normalized_email", true, "normalized_email"), "normalized_email"), active(idx("uq_active_contact_normalized_phone", true, "normalized_phone"), "normalized_phone"), idx("ix_contact_organization", false, "organization_id"))},
		{Name: "crm_enquiries", Validator: closed([]string{"public_id", "source_enquiry_id", "reference", "contact_id", "organization_id", "service_id", "owner_id", "stage", "source", "enquiry_type", "summary", "created_at", "updated_at"}, bson.M{"public_id": schema.PublicIDField(), "source_enquiry_id": schema.PublicIDField(), "reference": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 40}, "contact_id": str, "organization_id": str, "service_id": str, "owner_id": str, "stage": bson.M{"bsonType": "string", "enum": stages}, "source": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 80}, "enquiry_type": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 80}, "summary": bson.M{"bsonType": "string", "maxLength": 2000}, "deleted_at": nullDate, "created_at": date, "updated_at": date}), Indexes: public(idx("uq_crm_source_enquiry", true, "source_enquiry_id"), idx("ix_crm_stage_owner_created", false, "stage", "owner_id", "created_at"), idx("ix_crm_contact", false, "contact_id"), idx("ix_crm_organization", false, "organization_id"), idx("ix_crm_source", false, "source"))},
		{Name: "crm_saved_views", Validator: closed([]string{"public_id", "owner_id", "name", "filter", "created_at", "updated_at"}, bson.M{"public_id": schema.PublicIDField(), "owner_id": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 64}, "name": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 120}, "filter": filter, "created_at": date, "updated_at": date}), Indexes: public(idx("uq_crm_view_owner_name", true, "owner_id", "name"), idx("ix_crm_view_owner", false, "owner_id"))},
	}
}

func evolveCRMCollections(ctx context.Context, db *mongo.Database) error {
	for _, name := range []string{"organizations", "contacts"} {
		if err := db.RunCommand(ctx, bson.D{{Key: "collMod", Value: name}, {Key: "validationLevel", Value: "off"}}).Err(); err != nil {
			return fmt.Errorf("disable %s validation: %w", name, err)
		}
	}
	organizations := map[bson.ObjectID]string{}
	cursor, err := db.Collection("organizations").Find(ctx, bson.M{})
	if err != nil {
		return err
	}
	var orgs []bson.M
	if err = cursor.All(ctx, &orgs); err != nil {
		return err
	}
	for _, raw := range orgs {
		id, _ := raw["_id"].(bson.ObjectID)
		publicID, _ := raw["public_id"].(string)
		organizations[id] = publicID
		set := bson.M{"normalized_name": normalizeCRMOrganizationName(stringValue(raw, "name")), "website": stringValue(raw, "website"), "country_code": strings.ToUpper(firstString(raw, "country_code", "country"))}
		unset := bson.M{"industry": "", "country": "", "notes": ""}
		if _, err = db.Collection("organizations").UpdateByID(ctx, id, bson.M{"$set": set, "$unset": unset}); err != nil {
			return err
		}
	}
	cursor, err = db.Collection("contacts").Find(ctx, bson.M{})
	if err != nil {
		return err
	}
	var contacts []bson.M
	if err = cursor.All(ctx, &contacts); err != nil {
		return err
	}
	for _, raw := range contacts {
		id, _ := raw["_id"].(bson.ObjectID)
		organizationID := ""
		if old, ok := raw["organization_id"].(bson.ObjectID); ok {
			organizationID = organizations[old]
		} else {
			organizationID = stringValue(raw, "organization_id")
		}
		name := strings.TrimSpace(firstString(raw, "name"))
		if name == "" {
			name = strings.TrimSpace(stringValue(raw, "first_name") + " " + stringValue(raw, "last_name"))
		}
		email := stringValue(raw, "email")
		set := bson.M{"organization_id": organizationID, "name": name, "email": email, "phone": stringValue(raw, "phone"), "role": firstString(raw, "role", "job_title"), "country_code": strings.ToUpper(firstString(raw, "country_code", "country")), "normalized_email": strings.ToLower(firstString(raw, "normalized_email", "email")), "normalized_phone": stringValue(raw, "normalized_phone")}
		unset := bson.M{"first_name": "", "last_name": "", "job_title": "", "source": "", "tags": "", "country": ""}
		if _, err = db.Collection("contacts").UpdateByID(ctx, id, bson.M{"$set": set, "$unset": unset}); err != nil {
			return err
		}
	}
	for collection, index := range map[string]string{"organizations": "uq_active_organization_normalized_name", "contacts": "uq_active_contact_normalized_email"} {
		_ = db.Collection(collection).Indexes().DropOne(ctx, index)
	}
	return nil
}
func normalizeCRMOrganizationName(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}
func stringValue(document bson.M, key string) string {
	value, _ := document[key].(string)
	return value
}
func firstString(document bson.M, keys ...string) string {
	for _, key := range keys {
		if value := stringValue(document, key); value != "" {
			return value
		}
	}
	return ""
}
