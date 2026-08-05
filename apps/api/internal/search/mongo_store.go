package search

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ database *mongo.Database }

func NewMongoStore(database *mongo.Database) *MongoStore { return &MongoStore{database: database} }

type source struct {
	kind       Kind
	collection string
	projection bson.M
	decode     func(bson.M, float64) Result
}

func (store *MongoStore) Search(ctx context.Context, text string, allowed []Kind, limit int) ([]Result, error) {
	result := make([]Result, 0, limit)
	for _, kind := range allowed {
		for _, candidate := range sources(kind) {
			items, err := store.searchSource(ctx, candidate, text, limit)
			if err != nil {
				return nil, err
			}
			result = append(result, items...)
		}
	}
	return result, nil
}

func (store *MongoStore) searchSource(ctx context.Context, source source, text string, limit int) ([]Result, error) {
	projection := source.projection
	projection["score"] = bson.M{"$meta": "textScore"}
	filter := bson.M{"$text": bson.M{"$search": text}, "deleted_at": bson.M{"$exists": false}}
	if source.kind == KindContent {
		delete(filter, "deleted_at")
	}
	cursor, err := store.database.Collection(source.collection).Find(ctx, filter, options.Find().SetProjection(projection).SetSort(bson.M{"score": bson.M{"$meta": "textScore"}}).SetLimit(int64(limit)))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := []Result{}
	for cursor.Next(ctx) {
		var document bson.M
		if err = cursor.Decode(&document); err != nil {
			return nil, err
		}
		score, _ := document["score"].(float64)
		item := source.decode(document, score)
		if validResult(item) {
			items = append(items, item)
		}
	}
	return items, cursor.Err()
}

func sources(kind Kind) []source {
	field := func(document bson.M, key string) string { value, _ := document[key].(string); return value }
	base := bson.M{"_id": 0, "public_id": 1}
	switch kind {
	case KindEnquiry:
		return []source{{kind, "crm_enquiries", merge(base, "reference", "stage"), func(d bson.M, score float64) Result {
			id := field(d, "public_id")
			return Result{id, kind, field(d, "reference"), field(d, "stage"), "/admin/crm?enquiry=" + id, score}
		}}}
	case KindContact:
		return []source{{kind, "contacts", merge(base, "name", "role"), func(d bson.M, score float64) Result {
			id := field(d, "public_id")
			return Result{id, kind, field(d, "name"), field(d, "role"), "/admin/crm?contact=" + id, score}
		}}}
	case KindCampaign:
		return []source{{kind, "campaigns", merge(base, "title", "status"), func(d bson.M, score float64) Result {
			id := field(d, "public_id")
			return Result{id, kind, field(d, "title"), field(d, "status"), "/admin/campaigns?campaign=" + id, score}
		}}}
	case KindBooking:
		return []source{{kind, "bookings", merge(base, "title", "status"), func(d bson.M, score float64) Result {
			id := field(d, "public_id")
			return Result{id, kind, field(d, "title"), field(d, "status"), "/admin/bookings?booking=" + id, score}
		}}}
	case KindContent:
		collections := []string{"pages", "portfolio_items", "videos", "press_items", "testimonials"}
		out := make([]source, 0, len(collections))
		for _, collection := range collections {
			name := collection
			out = append(out, source{kind, name, merge(base, "title", "status"), func(d bson.M, score float64) Result {
				id := field(d, "public_id")
				return Result{id, kind, field(d, "title"), fmt.Sprintf("%s · %s", name, field(d, "status")), "/admin/content?item=" + id, score}
			}})
		}
		return out
	default:
		return nil
	}
}

func merge(base bson.M, keys ...string) bson.M {
	result := bson.M{}
	for key, value := range base {
		result[key] = value
	}
	for _, key := range keys {
		result[key] = 1
	}
	return result
}
