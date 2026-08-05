package issuance

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Delivery struct {
	PublicID, Reference, BuyerEmail, AccessURL string
	Attempts                                   int
}
type Sender interface {
	SendTickets(context.Context, Delivery) error
}
type UnavailableSender struct{}

func (UnavailableSender) SendTickets(context.Context, Delivery) error {
	return errors.New("ticket email unavailable")
}

type DeliveryWorker struct {
	db      *mongo.Database
	issuer  *MongoIssuer
	sender  Sender
	baseURL string
	now     func() time.Time
	claimID func() (string, error)
}

func NewDeliveryWorker(db *mongo.Database, issuer *MongoIssuer, sender Sender, baseURL string) (*DeliveryWorker, error) {
	u, err := url.Parse(baseURL)
	localHTTP := u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1")
	if db == nil || issuer == nil || sender == nil || err != nil || (u.Scheme != "https" && !localHTTP) || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, ErrInvalid
	}
	return &DeliveryWorker{db: db, issuer: issuer, sender: sender, baseURL: strings.TrimRight(baseURL, "/"), now: time.Now, claimID: uuid}, nil
}
func (w *DeliveryWorker) RunOnce(ctx context.Context, limit int) error {
	if limit < 1 || limit > 100 {
		return ErrInvalid
	}
	now := w.now().UTC()
	for range limit {
		claimToken, claimErr := w.claimID()
		if claimErr != nil {
			return claimErr
		}
		var item struct {
			PublicID  string        `bson:"public_id"`
			OrderID   bson.ObjectID `bson:"order_id"`
			Reference string        `bson:"order_reference"`
			Attempts  int           `bson:"attempts"`
		}
		err := w.db.Collection("ticket_delivery_outbox").FindOneAndUpdate(ctx, bson.M{"$or": bson.A{bson.M{"status": "pending", "next_attempt_at": bson.M{"$lte": now}}, bson.M{"status": "processing", "claimed_at": bson.M{"$lte": now.Add(-2 * time.Minute)}}}}, bson.M{"$set": bson.M{"status": "processing", "claimed_at": now, "claim_token": claimToken, "updated_at": now}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&item)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil
		}
		if err != nil {
			return err
		}
		var order struct {
			BuyerEmail string `bson:"buyer_email"`
		}
		if err = w.db.Collection("ticket_orders").FindOne(ctx, bson.M{"_id": item.OrderID, "status": "paid"}).Decode(&order); err != nil {
			return err
		}
		var accessOrder struct {
			PublicID string `bson:"public_id"`
		}
		if err = w.db.Collection("ticket_orders").FindOne(ctx, bson.M{"_id": item.OrderID}).Decode(&accessOrder); err != nil {
			return err
		}
		access := w.issuer.orderBearer(accessOrder.PublicID)
		delivery := Delivery{PublicID: item.PublicID, Reference: item.Reference, BuyerEmail: order.BuyerEmail, AccessURL: fmt.Sprintf("%s/tickets/%s?access=%s", w.baseURL, item.Reference, access), Attempts: item.Attempts}
		if err = w.sender.SendTickets(ctx, delivery); err == nil {
			var result *mongo.UpdateResult
			result, err = w.db.Collection("ticket_delivery_outbox").UpdateOne(ctx, bson.M{"public_id": item.PublicID, "status": "processing", "claim_token": claimToken}, bson.M{"$set": bson.M{"status": "sent", "sent_at": now, "updated_at": now}, "$unset": bson.M{"claimed_at": "", "claim_token": ""}})
			if err != nil {
				return err
			}
			if result.MatchedCount != 1 {
				continue
			}
			continue
		}
		attempts := item.Attempts + 1
		status := "pending"
		set := bson.M{"status": status, "attempts": attempts, "next_attempt_at": now.Add(time.Duration(math.Min(math.Pow(2, float64(attempts)), 3600)) * time.Second), "updated_at": now, "last_error_code": "delivery_failed"}
		if attempts >= 8 {
			set["status"] = "dead_letter"
			set["dead_lettered_at"] = now
		}
		if _, err = w.db.Collection("ticket_delivery_outbox").UpdateOne(ctx, bson.M{"public_id": item.PublicID, "status": "processing", "claim_token": claimToken}, bson.M{"$set": set, "$unset": bson.M{"claimed_at": "", "claim_token": ""}}); err != nil {
			return err
		}
	}
	return nil
}
func (w *DeliveryWorker) Run(ctx context.Context, interval time.Duration) error {
	if interval <= 0 {
		return ErrInvalid
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if err := w.RunOnce(ctx, 50); err != nil {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
