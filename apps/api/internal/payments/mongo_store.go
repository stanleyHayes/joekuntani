package payments

import (
	"context"
	"errors"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/issuance"
	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/ticketing"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"time"
)

type MongoStore struct {
	db     *mongo.Database
	issuer issuance.Issuer
}

func NewMongoStore(db *mongo.Database) *MongoStore     { return &MongoStore{db: db} }
func (s *MongoStore) SetIssuer(issuer issuance.Issuer) { s.issuer = issuer }
func (s *MongoStore) CheckoutOrder(ctx context.Context, ref, key string, now time.Time) (Order, error) {
	var d struct {
		PublicID          string          `bson:"public_id"`
		Reference         string          `bson:"reference"`
		EventID           string          `bson:"event_id"`
		BuyerEmail        string          `bson:"buyer_email"`
		Currency          string          `bson:"currency"`
		Total             bson.Decimal128 `bson:"total"`
		IdempotencyHash   string          `bson:"idempotency_hash"`
		Status            string          `bson:"status"`
		HoldExpiresAt     time.Time       `bson:"hold_expires_at"`
		CheckoutSessionID string          `bson:"checkout_session_id"`
		CheckoutURL       string          `bson:"checkout_url"`
		CheckoutExpiresAt time.Time       `bson:"checkout_expires_at"`
	}
	err := s.db.Collection("ticket_orders").FindOne(ctx, bson.M{"reference": ref}).Decode(&d)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Order{}, ErrForbidden
	}
	if err != nil {
		return Order{}, ErrUnavailable
	}
	if !secureEqual(d.IdempotencyHash, key) {
		return Order{}, ErrForbidden
	}
	if (d.Status != "pending" && d.Status != "awaiting_payment") || !d.HoldExpiresAt.After(now) {
		return Order{}, ErrConflict
	}
	o := Order{PublicID: d.PublicID, Reference: d.Reference, EventID: d.EventID, Currency: d.Currency, Total: d.Total.String(), IdempotencyHash: d.IdempotencyHash, BuyerEmail: d.BuyerEmail, Status: d.Status, HoldExpiresAt: d.HoldExpiresAt}
	if d.CheckoutSessionID != "" {
		o.CheckoutSession = &CheckoutSession{ID: d.CheckoutSessionID, URL: d.CheckoutURL, ExpiresAt: d.CheckoutExpiresAt}
	}
	return o, nil
}
func (s *MongoStore) SaveCheckout(ctx context.Context, o Order, provider string, c CheckoutSession, now time.Time) error {
	session, e := s.db.Client().StartSession()
	if e != nil {
		return ErrUnavailable
	}
	defer session.EndSession(ctx)
	_, e = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
		u, e := s.db.Collection("ticket_orders").UpdateOne(tx, bson.M{"public_id": o.PublicID, "status": bson.M{"$in": bson.A{"pending", "awaiting_payment"}}, "hold_expires_at": bson.M{"$gt": now}}, bson.M{"$set": bson.M{"status": "awaiting_payment", "payment_provider": provider, "payment_reference": c.ID, "checkout_session_id": c.ID, "checkout_url": c.URL, "checkout_expires_at": c.ExpiresAt, "updated_at": now}})
		if e != nil || u.MatchedCount != 1 {
			return nil, ErrConflict
		}
		return nil, s.audit(tx, "ticket_payment.checkout", o.PublicID, now)
	})
	if e != nil {
		return e
	}
	return nil
}
func (s *MongoStore) ApplyWebhook(ctx context.Context, provider string, e VerifiedEvent, payloadHash string, now time.Time) (bool, error) {
	if count, err := s.db.Collection("payment_webhooks").CountDocuments(ctx, bson.M{"provider": provider, "external_event_id": e.ID}); err != nil {
		return false, ErrUnavailable
	} else if count > 0 {
		return false, nil
	}
	session, err := s.db.Client().StartSession()
	if err != nil {
		return false, ErrUnavailable
	}
	defer session.EndSession(ctx)
	applied := false
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
		id := bson.NewObjectID()
		publicID := id.Hex() + "00000000"
		_, x := s.db.Collection("payment_webhooks").InsertOne(tx, bson.M{"public_id": publicID[:8] + "-" + publicID[8:12] + "-4" + publicID[13:16] + "-a" + publicID[17:20] + "-" + publicID[20:32], "provider": provider, "external_event_id": e.ID, "event_type": e.Type, "order_reference": e.OrderReference, "signature_valid": true, "payload_hash": payloadHash, "processing_status": "processed", "processed_at": now, "created_at": now})
		if mongo.IsDuplicateKeyError(x) {
			return nil, x
		}
		if x != nil {
			return nil, x
		}
		var order struct {
			InternalID bson.ObjectID         `bson:"_id"`
			PublicID   string                `bson:"public_id"`
			EventID    string                `bson:"event_id"`
			Status     ticketing.OrderStatus `bson:"status"`
		}
		if x = s.db.Collection("ticket_orders").FindOne(tx, bson.M{"reference": e.OrderReference, "payment_provider": provider}).Decode(&order); x != nil {
			return nil, ErrConflict
		}
		if order.Status == ticketing.StatusPaid || order.Status == ticketing.StatusPaymentFailed || order.Status == ticketing.StatusReconciliationRequired {
			return nil, nil
		}
		if e.Type != "payment.succeeded" && e.Type != "payment.failed" {
			return nil, ErrInvalid
		}
		var items []struct {
			InternalID   bson.ObjectID `bson:"_id"`
			TicketTypeID string        `bson:"ticket_type_id"`
			Quantity     int           `bson:"quantity"`
		}
		cursor, cursorErr := s.db.Collection("ticket_order_items").Find(tx, bson.M{"order_id": order.PublicID})
		if cursorErr != nil {
			return nil, cursorErr
		}
		if cursorErr = cursor.All(tx, &items); cursorErr != nil {
			return nil, cursorErr
		}
		status := ticketing.StatusPaymentFailed
		set := bson.M{"status": status, "payment_failed_at": now, "payment_failure_code": e.FailureCode, "updated_at": now}
		if e.Type == "payment.succeeded" {
			if s.issuer == nil {
				return nil, ErrUnavailable
			}
			status = ticketing.StatusPaid
			set = bson.M{"status": status, "paid_at": now, "payment_reference": e.PaymentReference, "updated_at": now}
			canFulfill := true
			for _, item := range items {
				var inventory struct {
					Capacity int `bson:"capacity"`
					Sold     int `bson:"sold"`
					Reserved int `bson:"reserved"`
				}
				if findErr := s.db.Collection("ticket_types").FindOne(tx, bson.M{"public_id": item.TicketTypeID}).Decode(&inventory); findErr != nil {
					return nil, findErr
				}
				if (order.Status == ticketing.StatusExpired && inventory.Sold+inventory.Reserved+item.Quantity > inventory.Capacity) || (order.Status != ticketing.StatusExpired && inventory.Reserved < item.Quantity) {
					canFulfill = false
					break
				}
			}
			if !canFulfill {
				status = ticketing.StatusReconciliationRequired
				set = bson.M{"status": status, "payment_reference": e.PaymentReference, "updated_at": now}
			}
			for _, item := range items {
				if !canFulfill {
					break
				}
				filter := bson.M{"public_id": item.TicketTypeID}
				change := bson.M{"$inc": bson.M{"sold": item.Quantity}, "$set": bson.M{"updated_at": now}}
				if order.Status == ticketing.StatusExpired {
					filter["$expr"] = bson.M{"$lte": bson.A{bson.M{"$add": bson.A{"$sold", "$reserved", item.Quantity}}, "$capacity"}}
				} else {
					filter["reserved"] = bson.M{"$gte": item.Quantity}
					change["$inc"].(bson.M)["reserved"] = -item.Quantity
				}
				u, updateErr := s.db.Collection("ticket_types").UpdateOne(tx, filter, change)
				if updateErr != nil {
					return nil, updateErr
				}
				if u.MatchedCount != 1 {
					return nil, ErrConflict
				}
			}
			if canFulfill {
				var event struct {
					InternalID bson.ObjectID `bson:"_id"`
				}
				if issueErr := s.db.Collection("events").FindOne(tx, bson.M{"public_id": order.EventID}).Decode(&event); issueErr != nil {
					return nil, issueErr
				}
				lines := make([]issuance.Line, len(items))
				for index, item := range items {
					var ticketType struct {
						InternalID bson.ObjectID `bson:"_id"`
					}
					if issueErr := s.db.Collection("ticket_types").FindOne(tx, bson.M{"public_id": item.TicketTypeID}).Decode(&ticketType); issueErr != nil {
						return nil, issueErr
					}
					lines[index] = issuance.Line{OrderItemID: item.InternalID, TicketTypeID: ticketType.InternalID, Quantity: item.Quantity}
				}
				if issueErr := s.issuer.IssuePaid(tx, order.InternalID, event.InternalID, order.PublicID, e.OrderReference, lines, now); issueErr != nil {
					return nil, issueErr
				}
			}
		} else if order.Status != ticketing.StatusExpired {
			for _, item := range items {
				u, updateErr := s.db.Collection("ticket_types").UpdateOne(tx, bson.M{"public_id": item.TicketTypeID, "reserved": bson.M{"$gte": item.Quantity}}, bson.M{"$inc": bson.M{"reserved": -item.Quantity}, "$set": bson.M{"updated_at": now}})
				if updateErr != nil || u.MatchedCount != 1 {
					return nil, ErrConflict
				}
			}
		}
		u, x := s.db.Collection("ticket_orders").UpdateOne(tx, bson.M{"public_id": order.PublicID, "status": order.Status}, bson.M{"$set": set})
		if x != nil || u.MatchedCount != 1 {
			return nil, ErrConflict
		}
		if x = s.audit(tx, "ticket_payment."+string(status), order.PublicID, now); x != nil {
			return nil, x
		}
		applied = true
		return nil, nil
	})
	if mongo.IsDuplicateKeyError(err) {
		return false, nil
	}
	return applied, err
}
func (s *MongoStore) audit(ctx context.Context, action, entity string, now time.Time) error {
	id := bson.NewObjectID().Hex() + "00000000"
	_, err := s.db.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": id[:8] + "-" + id[8:12] + "-4" + id[13:16] + "-a" + id[17:20] + "-" + id[20:32], "actor_id": bson.NilObjectID, "action": action, "entity_type": "ticket_order", "entity_id": entity, "metadata": bson.M{}, "created_at": now})
	return err
}

var _ Store = (*MongoStore)(nil)
