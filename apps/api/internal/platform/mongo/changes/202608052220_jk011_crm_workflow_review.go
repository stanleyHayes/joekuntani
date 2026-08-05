package changes

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/platform/mongo/schema"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const crmWorkflowReviewChangeName = "202608052220_jk011_crm_workflow_review"

func crmWorkflowReviewChange() Change {
	collections := exactCRMWorkflowCollections()
	evolves := []string{"enquiry_notes", "tasks", "crm_enquiry_notes", "crm_tasks"}
	canonical, err := schema.CanonicalChecksum(collections)
	if err != nil {
		panic(err)
	}
	return Change{
		Name: crmWorkflowReviewChangeName, Checksum: Checksum(canonical + "|legacy-no-loss|evolves=" + strings.Join(evolves, ",")),
		Supersedes: []string{crmWorkflowChangeName}, EvolvesCollections: evolves,
		Apply: func(ctx context.Context, db *mongo.Database) error {
			if err := migrateLegacyCRMWorkflow(ctx, db); err != nil {
				return err
			}
			return schema.Apply(ctx, db, collections)
		},
		Verify: func(ctx context.Context, db *mongo.Database) error {
			if err := schema.Verify(ctx, db, collections); err != nil {
				return err
			}
			return verifyLegacyCRMWorkflow(ctx, db)
		},
	}
}

func migrateLegacyCRMWorkflow(ctx context.Context, db *mongo.Database) error {
	session, err := db.Client().StartSession()
	if err != nil {
		return fmt.Errorf("start legacy CRM workflow migration: %w", err)
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
		if err := migrateLegacyNotes(tx, db); err != nil {
			return nil, err
		}
		if err := migrateLegacyTasks(tx, db); err != nil {
			return nil, err
		}
		return nil, nil
	})
	if err != nil {
		return fmt.Errorf("transactionally migrate legacy CRM workflow: %w", err)
	}
	return nil
}

func migrateLegacyNotes(ctx context.Context, db *mongo.Database) error {
	cursor, err := db.Collection("enquiry_notes").Find(ctx, bson.M{})
	if err != nil {
		return fmt.Errorf("read legacy enquiry notes: %w", err)
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var row struct {
			ID        bson.ObjectID `bson:"_id"`
			PublicID  string        `bson:"public_id"`
			EnquiryID bson.ObjectID `bson:"enquiry_id"`
			AuthorID  bson.ObjectID `bson:"author_id"`
			Body      string        `bson:"body"`
			CreatedAt time.Time     `bson:"created_at"`
		}
		if err := cursor.Decode(&row); err != nil {
			return fmt.Errorf("decode legacy enquiry note: %w", err)
		}
		enquiryID, err := resolveCRMEnquiryFromLegacy(ctx, db, row.EnquiryID)
		if err == nil {
			err = requireLegacyUser(ctx, db, row.AuthorID)
		}
		if err != nil || row.PublicID == "" || row.AuthorID.IsZero() || row.Body == "" || row.CreatedAt.IsZero() {
			return fmt.Errorf("legacy enquiry note %s has unresolved or invalid identity: %w", row.ID.Hex(), err)
		}
		document := bson.M{"public_id": row.PublicID, "enquiry_id": enquiryID, "author_id": row.AuthorID.Hex(), "body": row.Body, "created_at": row.CreatedAt.UTC()}
		if _, err := db.Collection("crm_enquiry_notes").UpdateOne(ctx, bson.M{"public_id": row.PublicID}, bson.M{"$setOnInsert": document}, options.UpdateOne().SetUpsert(true)); err != nil {
			return fmt.Errorf("migrate legacy enquiry note %s: %w", row.PublicID, err)
		}
	}
	return cursor.Err()
}

func migrateLegacyTasks(ctx context.Context, db *mongo.Database) error {
	cursor, err := db.Collection("tasks").Find(ctx, bson.M{"enquiry_id": bson.M{"$type": "objectId"}})
	if err != nil {
		return fmt.Errorf("read legacy enquiry tasks: %w", err)
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var row struct {
			ID         bson.ObjectID `bson:"_id"`
			PublicID   string        `bson:"public_id"`
			EnquiryID  bson.ObjectID `bson:"enquiry_id"`
			AssigneeID bson.ObjectID `bson:"assignee_id"`
			Title      string        `bson:"title"`
			Priority   string        `bson:"priority"`
			Status     string        `bson:"status"`
			DueAt      time.Time     `bson:"due_at"`
			CreatedAt  time.Time     `bson:"created_at"`
		}
		if err := cursor.Decode(&row); err != nil {
			return fmt.Errorf("decode legacy enquiry task: %w", err)
		}
		enquiryID, err := resolveCRMEnquiryFromLegacy(ctx, db, row.EnquiryID)
		if err == nil {
			err = requireLegacyUser(ctx, db, row.AssigneeID)
		}
		if err != nil || row.PublicID == "" || row.AssigneeID.IsZero() || row.Title == "" || row.DueAt.IsZero() || row.CreatedAt.IsZero() {
			return fmt.Errorf("legacy enquiry task %s has unresolved or invalid identity: %w", row.ID.Hex(), err)
		}
		status := "open"
		if row.Status == "done" || row.Status == "completed" {
			status = "done"
		}
		priority := legacyEnum(row.Priority, []string{"low", "normal", "high", "urgent"}, "normal")
		document := bson.M{"public_id": row.PublicID, "enquiry_id": enquiryID, "title": row.Title, "assignee_id": row.AssigneeID.Hex(), "priority": priority, "status": status, "due_at": row.DueAt.UTC(), "reminder_status": "pending", "created_at": row.CreatedAt.UTC(), "updated_at": row.CreatedAt.UTC()}
		if _, err := db.Collection("crm_tasks").UpdateOne(ctx, bson.M{"public_id": row.PublicID}, bson.M{"$setOnInsert": document}, options.UpdateOne().SetUpsert(true)); err != nil {
			return fmt.Errorf("migrate legacy enquiry task %s: %w", row.PublicID, err)
		}
	}
	return cursor.Err()
}

func requireLegacyUser(ctx context.Context, db *mongo.Database, id bson.ObjectID) error {
	if id.IsZero() || db.Collection("users").FindOne(ctx, bson.M{"_id": id}).Err() != nil {
		return fmt.Errorf("legacy user is missing")
	}
	return nil
}

func resolveCRMEnquiryFromLegacy(ctx context.Context, db *mongo.Database, legacyID bson.ObjectID) (string, error) {
	var source struct {
		PublicID string `bson:"public_id"`
	}
	if legacyID.IsZero() || db.Collection("enquiries").FindOne(ctx, bson.M{"_id": legacyID}).Decode(&source) != nil || source.PublicID == "" {
		return "", fmt.Errorf("legacy enquiry is missing")
	}
	var target struct {
		PublicID string `bson:"public_id"`
	}
	if db.Collection("crm_enquiries").FindOne(ctx, bson.M{"source_enquiry_id": source.PublicID}).Decode(&target) != nil || target.PublicID == "" {
		return "", fmt.Errorf("CRM enquiry for source %s is missing", source.PublicID)
	}
	return target.PublicID, nil
}

func verifyLegacyCRMWorkflow(ctx context.Context, db *mongo.Database) error {
	for _, pair := range []struct{ source, target string }{{"enquiry_notes", "crm_enquiry_notes"}, {"tasks", "crm_tasks"}} {
		filter := bson.M{}
		if pair.source == "tasks" {
			filter = bson.M{"enquiry_id": bson.M{"$type": "objectId"}}
		}
		cursor, err := db.Collection(pair.source).Find(ctx, filter, options.Find().SetProjection(bson.M{"public_id": 1}))
		if err != nil {
			return fmt.Errorf("verify legacy %s: %w", pair.source, err)
		}
		for cursor.Next(ctx) {
			var row struct {
				PublicID string `bson:"public_id"`
			}
			if err := cursor.Decode(&row); err != nil {
				cursor.Close(ctx)
				return err
			}
			if err := db.Collection(pair.target).FindOne(ctx, bson.M{"public_id": row.PublicID}).Err(); err != nil {
				cursor.Close(ctx)
				return fmt.Errorf("legacy %s %s is not visible in %s: %w", pair.source, row.PublicID, pair.target, err)
			}
		}
		if err := cursor.Err(); err != nil {
			cursor.Close(ctx)
			return err
		}
		cursor.Close(ctx)
	}
	return nil
}
