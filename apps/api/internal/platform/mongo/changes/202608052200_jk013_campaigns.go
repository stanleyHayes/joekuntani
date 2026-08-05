package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const campaignsChangeName = "202608052200_jk013_campaigns"

func campaignsChange() Change {
	collections := exactCampaignCollections()
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:               campaignsChangeName,
		Checksum:           Checksum(canonical + "|evolves=campaigns"),
		EvolvesCollections: []string{"campaigns"},
		Apply: func(ctx context.Context, db *mongo.Database) error {
			if err := evolveCampaigns(ctx, db); err != nil {
				return err
			}
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error {
			return schema.Verify(ctx, db, collections)
		},
	}
}

func exactCampaignCollections() []schema.Collection {
	date := schema.Field("date")
	nullableDate := schema.Field("date", "null")
	publicID := schema.PublicIDField()
	currency := bson.M{"bsonType": "string", "enum": bson.A{"GHS", "USD", "EUR", "GBP"}}
	result := bson.M{"bsonType": "object", "additionalProperties": false, "required": bson.A{"label", "value"}, "properties": bson.M{"label": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 120}, "value": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 240}}}
	campaignProperties := bson.M{
		"_id": bson.M{"bsonType": "objectId"}, "public_id": publicID,
		"enquiry_id": publicID, "organization_id": publicID,
		"title":     bson.M{"bsonType": "string", "minLength": 2, "maxLength": 160},
		"objective": bson.M{"bsonType": "string", "minLength": 2, "maxLength": 2000},
		"platforms": bson.M{"bsonType": "array", "minItems": 1, "maxItems": 20, "uniqueItems": true, "items": bson.M{"bsonType": "string", "minLength": 1, "maxLength": 80}},
		"starts_on": date, "ends_on": date,
		"status":     bson.M{"bsonType": "string", "enum": bson.A{"draft", "active", "paused", "completed", "cancelled"}},
		"fee":        bson.M{"bsonType": "decimal", "minimum": bson.Decimal128{}},
		"expenses":   bson.M{"bsonType": "decimal", "minimum": bson.Decimal128{}},
		"currency":   currency,
		"results":    bson.M{"bsonType": "array", "maxItems": 50, "items": result},
		"asset_ids":  bson.M{"bsonType": "array", "maxItems": 100, "uniqueItems": true, "items": publicID},
		"deleted_at": nullableDate, "created_at": date, "updated_at": date,
	}
	deliverableProperties := bson.M{
		"_id": bson.M{"bsonType": "objectId"}, "public_id": publicID, "campaign_id": publicID,
		"title":           bson.M{"bsonType": "string", "minLength": 2, "maxLength": 160},
		"platform":        bson.M{"bsonType": "string", "minLength": 1, "maxLength": 80},
		"format":          bson.M{"bsonType": "string", "minLength": 1, "maxLength": 80},
		"due_at":          date,
		"status":          bson.M{"bsonType": "string", "enum": bson.A{"pending", "in_progress", "submitted", "approved", "published"}},
		"published_url":   bson.M{"bsonType": "string", "maxLength": 2048},
		"approval_status": bson.M{"bsonType": "string", "enum": bson.A{"pending", "approved", "rejected"}},
		"asset_ids":       bson.M{"bsonType": "array", "maxItems": 50, "uniqueItems": true, "items": publicID},
		"created_at":      date, "updated_at": date,
	}
	closed := func(required bson.A, properties bson.M) bson.M {
		return bson.M{"$jsonSchema": bson.M{"bsonType": "object", "additionalProperties": false, "required": required, "properties": properties}}
	}
	return []schema.Collection{
		{
			Name:      "campaigns",
			Validator: closed(bson.A{"_id", "public_id", "enquiry_id", "organization_id", "title", "objective", "platforms", "starts_on", "ends_on", "status", "fee", "expenses", "currency", "results", "asset_ids", "created_at", "updated_at"}, campaignProperties),
			Indexes: []schema.Index{
				{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
				{Name: "ix_campaign_organization_status", Keys: bson.D{{Key: "organization_id", Value: 1}, {Key: "status", Value: 1}}},
				{Name: "ix_campaign_dates_status", Keys: bson.D{{Key: "starts_on", Value: 1}, {Key: "ends_on", Value: 1}, {Key: "status", Value: 1}}},
			},
		},
		{
			Name:      "campaign_deliverables",
			Validator: closed(bson.A{"_id", "public_id", "campaign_id", "title", "platform", "format", "due_at", "status", "published_url", "approval_status", "asset_ids", "created_at", "updated_at"}, deliverableProperties),
			Indexes: []schema.Index{
				{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
				{Name: "ix_deliverable_campaign_due_status", Keys: bson.D{{Key: "campaign_id", Value: 1}, {Key: "due_at", Value: 1}, {Key: "status", Value: 1}}},
			},
		},
	}
}

func evolveCampaigns(ctx context.Context, db *mongo.Database) error {
	if err := db.RunCommand(ctx, bson.D{{Key: "collMod", Value: "campaigns"}, {Key: "validationLevel", Value: "off"}}).Err(); err != nil {
		return err
	}
	cursor, err := db.Collection("campaigns").Find(ctx, bson.M{})
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)
	var rows []bson.M
	if err = cursor.All(ctx, &rows); err != nil {
		return err
	}
	for _, row := range rows {
		set := bson.M{
			"enquiry_id":      resolvePublicID(ctx, db, "crm_enquiries", row["enquiry_id"]),
			"organization_id": resolvePublicID(ctx, db, "organizations", row["organization_id"]),
			"platforms":       bson.A{"unspecified"}, "results": bson.A{}, "asset_ids": bson.A{},
		}
		if value, ok := row["start_date"]; ok {
			set["starts_on"] = value
		}
		if value, ok := row["end_date"]; ok {
			set["ends_on"] = value
		}
		if _, err = db.Collection("campaigns").UpdateByID(ctx, row["_id"], bson.M{"$set": set, "$unset": bson.M{"start_date": "", "end_date": ""}}); err != nil {
			return err
		}
	}
	return nil
}
