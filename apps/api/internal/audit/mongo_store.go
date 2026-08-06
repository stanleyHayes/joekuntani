package audit

import (
	"context"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ database *mongo.Database }

func NewMongoStore(database *mongo.Database) *MongoStore { return &MongoStore{database: database} }

func (store *MongoStore) Search(ctx context.Context, query Query) ([]Entry, error) {
	filter := bson.M{}
	and := bson.A{}
	if query.Action != "" {
		and = append(and, bson.M{"action": query.Action})
	}
	if query.EntityType != "" {
		and = append(and, bson.M{"entity_type": query.EntityType})
	}
	if query.From != nil || query.To != nil {
		created := bson.M{}
		if query.From != nil {
			created["$gte"] = query.From.UTC()
		}
		if query.To != nil {
			created["$lte"] = query.To.UTC()
		}
		and = append(and, bson.M{"created_at": created})
	}
	if query.Text != "" {
		pattern := escapeRegex(query.Text)
		and = append(and, bson.M{"$or": bson.A{
			bson.M{"action": bson.M{"$regex": pattern, "$options": "i"}},
			bson.M{"entity_type": bson.M{"$regex": pattern, "$options": "i"}},
			bson.M{"entity_id": bson.M{"$regex": pattern, "$options": "i"}},
		}})
	}
	if len(and) == 1 {
		filter = and[0].(bson.M)
	} else if len(and) > 1 {
		filter["$and"] = and
	}
	cursor, err := store.database.Collection("audit_logs").Find(ctx, filter, options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetLimit(int64(query.Limit)).
		SetProjection(bson.M{"_id": 0, "public_id": 1, "action": 1, "entity_type": 1, "entity_id": 1, "metadata": 1, "created_at": 1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := []Entry{}
	for cursor.Next(ctx) {
		var document struct {
			PublicID   string    `bson:"public_id"`
			Action     string    `bson:"action"`
			EntityType string    `bson:"entity_type"`
			EntityID   string    `bson:"entity_id"`
			Metadata   bson.M    `bson:"metadata"`
			CreatedAt  time.Time `bson:"created_at"`
		}
		if err = cursor.Decode(&document); err != nil {
			return nil, err
		}
		outcome := ""
		if document.Metadata != nil {
			if value, ok := document.Metadata["outcome"].(string); ok {
				outcome = value
			}
		}
		items = append(items, Entry{
			ID:         document.PublicID,
			Action:     document.Action,
			EntityType: document.EntityType,
			EntityID:   document.EntityID,
			Outcome:    outcome,
			CreatedAt:  document.CreatedAt.UTC(),
		})
	}
	return items, cursor.Err()
}

func escapeRegex(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `.`, `\.`, `+`, `\+`, `*`, `\*`, `?`, `\?`, `(`, `\(`, `)`, `\)`, `[`, `\[`, `]`, `\]`, `{`, `\{`, `}`, `\}`, `|`, `\|`, `^`, `\^`, `$`, `\$`)
	return replacer.Replace(value)
}
