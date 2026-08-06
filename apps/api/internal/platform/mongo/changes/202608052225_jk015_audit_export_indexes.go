package changes

import (
	"context"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

const auditExportIndexesChangeName = "202608052225_jk015_audit_export_indexes"

func auditExportIndexesChange() Change {
	collections := exactAuditExportCollections()
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name:               auditExportIndexesChangeName,
		Checksum:           Checksum(canonical + "|evolves=audit_logs"),
		EvolvesCollections: []string{"audit_logs"},
		Apply: func(ctx context.Context, db *mongo.Database) error {
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error {
			return schema.Verify(ctx, db, collections)
		},
	}
}

func exactAuditExportCollections() []schema.Collection {
	stringField := schema.Field("string")
	dateField := schema.Field("date")
	objectField := schema.Field("object")
	properties := bson.M{
		"_id":         schema.Field("objectId"),
		"public_id":   schema.PublicIDField(),
		"actor_id":    schema.Field("objectId", "null"),
		"action":      stringField,
		"entity_type": stringField,
		"entity_id":   stringField,
		"metadata":    objectField,
		"created_at":  dateField,
	}
	return []schema.Collection{{
		Name: "audit_logs",
		Validator: bson.M{"$jsonSchema": bson.M{
			"bsonType":             "object",
			"additionalProperties": false,
			"required":             bson.A{"_id", "public_id", "action", "entity_type", "entity_id", "metadata", "created_at"},
			"properties":           properties,
		}},
		Indexes: []schema.Index{
			{Name: "uq_public_id", Keys: bson.D{{Key: "public_id", Value: 1}}, Unique: true},
			{Name: "ix_audit_actor_created", Keys: bson.D{{Key: "actor_id", Value: 1}, {Key: "created_at", Value: 1}}},
			{Name: "ix_audit_entity_created", Keys: bson.D{{Key: "entity_type", Value: 1}, {Key: "entity_id", Value: 1}, {Key: "created_at", Value: 1}}},
			{Name: "ix_audit_action_created", Keys: bson.D{{Key: "action", Value: 1}, {Key: "created_at", Value: 1}}},
			{Name: "ix_audit_created", Keys: bson.D{{Key: "created_at", Value: -1}}},
		},
	}}
}
