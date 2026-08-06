package analytics

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ database *mongo.Database }

func NewMongoStore(database *mongo.Database) *MongoStore { return &MongoStore{database: database} }

func (store *MongoStore) AppendConversion(ctx context.Context, event ConversionEvent) error {
	_, err := store.database.Collection("conversion_events").InsertOne(ctx, bson.M{
		"public_id":   event.PublicID,
		"name":        string(event.Name),
		"properties":  event.Properties,
		"internal":    event.Internal,
		"occurred_at": event.OccurredAt.UTC(),
		"created_at":  event.CreatedAt.UTC(),
	})
	return err
}

func (store *MongoStore) CountConversions(ctx context.Context, name EventName, since time.Time) (int, error) {
	filter := bson.M{"occurred_at": bson.M{"$gte": since.UTC()}, "internal": false}
	if name != "" {
		filter["name"] = string(name)
	}
	count, err := store.database.Collection("conversion_events").CountDocuments(ctx, filter)
	return int(count), err
}

func (store *MongoStore) TopProperty(ctx context.Context, name EventName, property string, since time.Time, limit int) ([]NamedCount, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"name": string(name), "occurred_at": bson.M{"$gte": since.UTC()}, "internal": false}}},
		{{Key: "$group", Value: bson.M{"_id": "$properties." + property, "count": bson.M{"$sum": 1}}}},
		{{Key: "$match", Value: bson.M{"_id": bson.M{"$type": "string", "$ne": ""}}}},
		{{Key: "$sort", Value: bson.D{{Key: "count", Value: -1}, {Key: "_id", Value: 1}}}},
		{{Key: "$limit", Value: int64(limit)}},
	}
	cursor, err := store.database.Collection("conversion_events").Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	out := []NamedCount{}
	for cursor.Next(ctx) {
		var row struct {
			ID    string `bson:"_id"`
			Count int    `bson:"count"`
		}
		if err = cursor.Decode(&row); err != nil {
			return nil, err
		}
		out = append(out, NamedCount{Name: row.ID, Count: row.Count})
	}
	return out, cursor.Err()
}

func (store *MongoStore) PipelineCounts(ctx context.Context) (map[string]int, error) {
	return store.groupCount(ctx, "crm_enquiries", "stage", bson.M{"deleted_at": bson.M{"$exists": false}})
}

func (store *MongoStore) BookingStatusCounts(ctx context.Context) (map[string]int, error) {
	return store.groupCount(ctx, "bookings", "status", bson.M{"deleted_at": bson.M{"$exists": false}})
}

func (store *MongoStore) CampaignStatusCounts(ctx context.Context) (map[string]int, error) {
	return store.groupCount(ctx, "campaigns", "status", bson.M{"deleted_at": bson.M{"$exists": false}})
}

func (store *MongoStore) PublishedContentCount(ctx context.Context) (int, error) {
	total := 0
	for _, collection := range []string{"pages", "portfolio_items", "videos", "press_items", "testimonials"} {
		filter := bson.M{"status": "published"}
		if collection == "testimonials" {
			filter = bson.M{"approved": true}
		}
		if collection == "videos" || collection == "press_items" {
			filter = bson.M{"published_at": bson.M{"$type": "date"}}
		}
		count, err := store.database.Collection(collection).CountDocuments(ctx, filter)
		if err != nil {
			return 0, err
		}
		total += int(count)
	}
	return total, nil
}

func (store *MongoStore) AudienceMetrics(ctx context.Context, limit int) ([]AudienceMetric, error) {
	cursor, err := store.database.Collection("audience_metrics").Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "metric_date", Value: -1}}).SetLimit(int64(limit)).SetProjection(bson.M{
		"_id": 0, "platform": 1, "metric_date": 1, "followers": 1, "reach": 1, "impressions": 1,
	}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	out := []AudienceMetric{}
	for cursor.Next(ctx) {
		var row struct {
			Platform    string    `bson:"platform"`
			MetricDate  time.Time `bson:"metric_date"`
			Followers   int64     `bson:"followers"`
			Reach       int64     `bson:"reach"`
			Impressions int64     `bson:"impressions"`
		}
		if err = cursor.Decode(&row); err != nil {
			return nil, err
		}
		out = append(out, AudienceMetric{
			Platform:    row.Platform,
			MetricDate:  row.MetricDate.UTC().Format("2006-01-02"),
			Followers:   row.Followers,
			Reach:       row.Reach,
			Impressions: row.Impressions,
		})
	}
	return out, cursor.Err()
}

func (store *MongoStore) groupCount(ctx context.Context, collection, field string, match bson.M) (map[string]int, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: match}},
		{{Key: "$group", Value: bson.M{"_id": "$" + field, "count": bson.M{"$sum": 1}}}},
	}
	cursor, err := store.database.Collection(collection).Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	out := map[string]int{}
	for cursor.Next(ctx) {
		var row struct {
			ID    string `bson:"_id"`
			Count int    `bson:"count"`
		}
		if err = cursor.Decode(&row); err != nil {
			return nil, err
		}
		if row.ID != "" {
			out[row.ID] = row.Count
		}
	}
	return out, cursor.Err()
}
