package ticketanalytics

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ db *mongo.Database }

func NewMongoStore(db *mongo.Database) *MongoStore { return &MongoStore{db: db} }

func (s *MongoStore) SalesByCurrency(ctx context.Context) ([]MoneySummary, error) {
	cursor, err := s.db.Collection("ticket_orders").Find(ctx, bson.M{
		"status": bson.M{"$in": bson.A{"paid", "partially_refunded", "refunded"}},
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	type order struct {
		PublicID string          `bson:"public_id"`
		Currency string          `bson:"currency"`
		Fees     bson.Decimal128 `bson:"fees"`
		Total    bson.Decimal128 `bson:"total"`
	}
	groups := map[string]*MoneySummary{}
	orderIDs := bson.A{}
	for cursor.Next(ctx) {
		var row order
		if err = cursor.Decode(&row); err != nil {
			return nil, err
		}
		orderIDs = append(orderIDs, row.PublicID)
		g := groups[row.Currency]
		if g == nil {
			g = &MoneySummary{Currency: row.Currency, Revenue: "0.00", Fees: "0.00", Refunded: "0.00", Net: "0.00"}
			groups[row.Currency] = g
		}
		g.Orders++
		rv, _ := minor(row.Total.String())
		fv, _ := minor(row.Fees.String())
		gr, _ := minor(g.Revenue)
		gf, _ := minor(g.Fees)
		g.Revenue = moneyString(gr + rv)
		g.Fees = moneyString(gf + fv)
	}
	if err = cursor.Err(); err != nil {
		return nil, err
	}
	if len(orderIDs) > 0 {
		rc, err := s.db.Collection("ticket_refunds").Find(ctx, bson.M{
			"order_public_id": bson.M{"$in": orderIDs},
			"status":          "succeeded",
		})
		if err != nil {
			return nil, err
		}
		for rc.Next(ctx) {
			var refund struct {
				Currency string          `bson:"currency"`
				Amount   bson.Decimal128 `bson:"amount"`
			}
			if err = rc.Decode(&refund); err != nil {
				_ = rc.Close(ctx)
				return nil, err
			}
			g := groups[refund.Currency]
			if g == nil {
				continue
			}
			a, _ := minor(refund.Amount.String())
			x, _ := minor(g.Refunded)
			g.Refunded = moneyString(x + a)
		}
		_ = rc.Close(ctx)
	}
	out := make([]MoneySummary, 0, len(groups))
	for _, g := range groups {
		r, _ := minor(g.Revenue)
		f, _ := minor(g.Fees)
		x, _ := minor(g.Refunded)
		g.Net = moneyString(r - f - x)
		out = append(out, *g)
	}
	return out, nil
}

func (s *MongoStore) Inventory(ctx context.Context) (InventorySummary, error) {
	cursor, err := s.db.Collection("ticket_types").Find(ctx, bson.M{
		"status": bson.M{"$in": bson.A{"on_sale", "scheduled", "sold_out", "paused", "sale_ended"}},
	}, options.Find().SetProjection(bson.M{"capacity": 1, "reserved": 1, "sold": 1}))
	if err != nil {
		return InventorySummary{}, err
	}
	defer cursor.Close(ctx)
	var summary InventorySummary
	for cursor.Next(ctx) {
		var row struct {
			Capacity int64 `bson:"capacity"`
			Reserved int64 `bson:"reserved"`
			Sold     int64 `bson:"sold"`
		}
		if err = cursor.Decode(&row); err != nil {
			return InventorySummary{}, err
		}
		summary.QuantityTotal += row.Capacity
		summary.QuantityReserved += row.Reserved
		summary.QuantitySold += row.Sold
	}
	available := summary.QuantityTotal - summary.QuantityReserved - summary.QuantitySold
	if available < 0 {
		available = 0
	}
	summary.QuantityAvailable = available
	return summary, cursor.Err()
}

func (s *MongoStore) Funnel(ctx context.Context, since time.Time) (FunnelSummary, error) {
	count := func(name string) (int, error) {
		n, err := s.db.Collection("conversion_events").CountDocuments(ctx, bson.M{
			"name":        name,
			"occurred_at": bson.M{"$gte": since.UTC()},
		})
		return int(n), err
	}
	var out FunnelSummary
	var err error
	if out.SelectionStarted, err = count("ticket_selection_started"); err != nil {
		return FunnelSummary{}, err
	}
	if out.CheckoutStarted, err = count("ticket_checkout_started"); err != nil {
		return FunnelSummary{}, err
	}
	if out.PurchaseCompleted, err = count("ticket_purchase_completed"); err != nil {
		return FunnelSummary{}, err
	}
	if out.PurchaseFailed, err = count("ticket_purchase_failed"); err != nil {
		return FunnelSummary{}, err
	}
	if out.CheckedInEvents, err = count("ticket_checked_in"); err != nil {
		return FunnelSummary{}, err
	}
	return out, nil
}

func (s *MongoStore) Attendance(ctx context.Context) (AttendanceSummary, error) {
	counts, err := s.groupTicketStatus(ctx, bson.M{})
	if err != nil {
		return AttendanceSummary{}, err
	}
	return AttendanceSummary{
		Valid:     counts["valid"],
		CheckedIn: counts["checked_in"],
		Void:      counts["void"],
		Refunded:  counts["refunded"],
	}, nil
}

func (s *MongoStore) EventAttendance(ctx context.Context, limit int64) ([]EventAttendance, error) {
	if limit < 1 {
		limit = 10
	}
	pipeline := mongo.Pipeline{
		{{Key: "$group", Value: bson.M{
			"_id":        "$event_id",
			"issued":     bson.M{"$sum": 1},
			"checked_in": bson.M{"$sum": bson.M{"$cond": bson.A{bson.M{"$eq": bson.A{"$status", "checked_in"}}, 1, 0}}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "checked_in", Value: -1}, {Key: "issued", Value: -1}}}},
		{{Key: "$limit", Value: limit}},
	}
	cursor, err := s.db.Collection("issued_tickets").Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	out := []EventAttendance{}
	for cursor.Next(ctx) {
		var row struct {
			ID        bson.ObjectID `bson:"_id"`
			Issued    int64         `bson:"issued"`
			CheckedIn int64         `bson:"checked_in"`
		}
		if err = cursor.Decode(&row); err != nil {
			return nil, err
		}
		var event struct {
			PublicID string `bson:"public_id"`
			Title    string `bson:"title"`
		}
		if err = s.db.Collection("events").FindOne(ctx, bson.M{"_id": row.ID}).Decode(&event); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				continue
			}
			return nil, err
		}
		out = append(out, EventAttendance{
			EventID:   event.PublicID,
			Title:     event.Title,
			CheckedIn: row.CheckedIn,
			Issued:    row.Issued,
		})
	}
	return out, cursor.Err()
}

func (s *MongoStore) groupTicketStatus(ctx context.Context, filter bson.M) (map[string]int64, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$group", Value: bson.M{"_id": "$status", "count": bson.M{"$sum": 1}}}},
	}
	cursor, err := s.db.Collection("issued_tickets").Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	out := map[string]int64{}
	for cursor.Next(ctx) {
		var row struct {
			ID    string `bson:"_id"`
			Count int64  `bson:"count"`
		}
		if err = cursor.Decode(&row); err != nil {
			return nil, err
		}
		out[row.ID] = row.Count
	}
	return out, cursor.Err()
}
