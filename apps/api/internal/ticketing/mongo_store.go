package ticketing

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ db *mongo.Database }

func NewMongoStore(db *mongo.Database) *MongoStore { return &MongoStore{db: db} }

type orderDocument struct {
	PublicID      string          `bson:"public_id"`
	Reference     string          `bson:"reference"`
	RequestHash   string          `bson:"request_hash"`
	EventID       string          `bson:"event_id"`
	Currency      string          `bson:"currency"`
	Total         bson.Decimal128 `bson:"total"`
	Status        OrderStatus     `bson:"status"`
	HoldExpiresAt time.Time       `bson:"hold_expires_at"`
}
type itemDocument struct {
	PublicID     string          `bson:"public_id"`
	OrderID      string          `bson:"order_id"`
	EventID      string          `bson:"event_id"`
	TicketTypeID string          `bson:"ticket_type_id"`
	Quantity     int             `bson:"quantity"`
	UnitPrice    bson.Decimal128 `bson:"unit_price"`
	LineTotal    bson.Decimal128 `bson:"line_total"`
	CreatedAt    time.Time       `bson:"created_at"`
}
type ticketDocument struct {
	PublicID    string          `bson:"public_id"`
	EventID     string          `bson:"event_id"`
	Currency    string          `bson:"currency"`
	Price       bson.Decimal128 `bson:"price"`
	Capacity    int             `bson:"capacity"`
	Sold        int             `bson:"sold"`
	Reserved    int             `bson:"reserved"`
	MinPerOrder int             `bson:"min_per_order"`
	MaxPerOrder int             `bson:"max_per_order"`
	SalesStart  time.Time       `bson:"sales_start"`
	SalesEnd    time.Time       `bson:"sales_end"`
	Paused      bool            `bson:"paused"`
}

func (s *MongoStore) Create(ctx context.Context, keyHash, requestHash string, input CreateInput, now time.Time, hold time.Duration, id func() (string, error)) (Receipt, error) {
	if existing, ok, err := s.findByKey(ctx, keyHash); err != nil {
		return Receipt{}, err
	} else if ok {
		if existing.RequestHash != requestHash {
			return Receipt{}, ErrConflict
		}
		return receipt(existing, false), nil
	}
	orderID, err := id()
	if err != nil {
		return Receipt{}, ErrUnavailable
	}
	ref, err := reference(now)
	if err != nil {
		return Receipt{}, ErrUnavailable
	}
	ref = strings.ToUpper(ref)
	expires := now.Add(hold)
	var result Receipt
	session, err := s.db.Client().StartSession()
	if err != nil {
		return result, err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
		if existing, ok, e := s.findByKey(tx, keyHash); e != nil {
			return nil, e
		} else if ok {
			if existing.RequestHash != requestHash {
				return nil, ErrConflict
			}
			result = receipt(existing, false)
			return nil, nil
		}
		var event struct {
			Status string    `bson:"status"`
			EndsAt time.Time `bson:"ends_at"`
		}
		if e := s.db.Collection("events").FindOne(tx, bson.M{"public_id": input.EventID, "status": "published"}).Decode(&event); e != nil || !event.EndsAt.After(now) {
			return nil, ErrConflict
		}
		items := make([]any, 0, len(input.Items))
		currency := ""
		subtotal := int64(0)
		for _, selection := range input.Items {
			var ticket ticketDocument
			filter := bson.M{"public_id": selection.TicketTypeID, "event_id": input.EventID, "paused": false, "sales_start": bson.M{"$lte": now}, "sales_end": bson.M{"$gt": now}, "min_per_order": bson.M{"$lte": selection.Quantity}, "max_per_order": bson.M{"$gte": selection.Quantity}, "$expr": bson.M{"$lte": bson.A{bson.M{"$add": bson.A{"$sold", "$reserved", selection.Quantity}}, "$capacity"}}}
			e := s.db.Collection("ticket_types").FindOneAndUpdate(tx, filter, bson.M{"$inc": bson.M{"reserved": selection.Quantity}, "$set": bson.M{"updated_at": now}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&ticket)
			if e != nil {
				return nil, ErrConflict
			}
			if currency == "" {
				currency = ticket.Currency
			} else if currency != ticket.Currency {
				return nil, ErrInvalid
			}
			minor, e := parseMinor(ticket.Price.String())
			if e != nil {
				return nil, e
			}
			line := minor * int64(selection.Quantity)
			subtotal += line
			lineDecimal, _ := bson.ParseDecimal128(formatMinor(line))
			itemID, e := id()
			if e != nil {
				return nil, ErrUnavailable
			}
			items = append(items, itemDocument{PublicID: itemID, OrderID: orderID, EventID: input.EventID, TicketTypeID: selection.TicketTypeID, Quantity: selection.Quantity, UnitPrice: ticket.Price, LineTotal: lineDecimal, CreatedAt: now})
		}
		subtotalDecimal, _ := bson.ParseDecimal128(formatMinor(subtotal))
		zero, _ := bson.ParseDecimal128("0.00")
		doc := bson.M{"public_id": orderID, "reference": ref, "event_id": input.EventID, "buyer_name": input.BuyerName, "buyer_email": input.BuyerEmail, "buyer_phone": input.BuyerPhone, "currency": currency, "subtotal": subtotalDecimal, "fees": zero, "total": subtotalDecimal, "status": StatusPending, "idempotency_hash": keyHash, "request_hash": requestHash, "hold_expires_at": expires, "terms_version": input.TermsVersion, "terms_accepted_at": now, "created_at": now, "updated_at": now}
		if _, e := s.db.Collection("ticket_orders").InsertOne(tx, doc); e != nil {
			return nil, e
		}
		if _, e := s.db.Collection("ticket_order_items").InsertMany(tx, items); e != nil {
			return nil, e
		}
		if e := s.audit(tx, "ticket_order.create", orderID, now, id); e != nil {
			return nil, e
		}
		result = Receipt{Reference: ref, Status: StatusPending, Currency: currency, Total: formatMinor(subtotal), HoldExpiresAt: expires, Stored: true}
		return nil, nil
	})
	if err == nil {
		return result, nil
	}
	if mongo.IsDuplicateKeyError(err) {
		if existing, ok, e := s.findByKey(ctx, keyHash); e == nil && ok {
			if existing.RequestHash != requestHash {
				return Receipt{}, ErrConflict
			}
			return receipt(existing, false), nil
		}
		return Receipt{}, ErrConflict
	}
	if errors.Is(err, ErrConflict) || errors.Is(err, ErrInvalid) {
		return Receipt{}, err
	}
	return Receipt{}, ErrUnavailable
}
func (s *MongoStore) findByKey(ctx context.Context, key string) (orderDocument, bool, error) {
	var d orderDocument
	err := s.db.Collection("ticket_orders").FindOne(ctx, bson.M{"idempotency_hash": key}).Decode(&d)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return d, false, nil
	}
	return d, err == nil, err
}
func receipt(d orderDocument, stored bool) Receipt {
	return Receipt{Reference: d.Reference, Status: d.Status, Currency: d.Currency, Total: d.Total.String(), HoldExpiresAt: d.HoldExpiresAt, Stored: stored}
}

func (s *MongoStore) ExpireDue(ctx context.Context, now time.Time, limit int) (int, error) {
	cursor, err := s.db.Collection("ticket_orders").Find(ctx, bson.M{"status": bson.M{"$in": bson.A{StatusPending, StatusAwaitingPayment}}, "hold_expires_at": bson.M{"$lte": now}}, options.Find().SetLimit(int64(limit)).SetSort(bson.D{{Key: "hold_expires_at", Value: 1}}))
	if err != nil {
		return 0, err
	}
	defer cursor.Close(ctx)
	var orders []orderDocument
	if err = cursor.All(ctx, &orders); err != nil {
		return 0, err
	}
	expired := 0
	for _, order := range orders {
		session, e := s.db.Client().StartSession()
		if e != nil {
			return expired, e
		}
		_, e = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
			updated, e := s.db.Collection("ticket_orders").UpdateOne(tx, bson.M{"public_id": order.PublicID, "status": bson.M{"$in": bson.A{StatusPending, StatusAwaitingPayment}}, "hold_expires_at": bson.M{"$lte": now}}, bson.M{"$set": bson.M{"status": StatusExpired, "updated_at": now}})
			if e != nil || updated.MatchedCount == 0 {
				return nil, e
			}
			items, e := s.items(tx, order.PublicID)
			if e != nil {
				return nil, e
			}
			for _, item := range items {
				release, e := s.db.Collection("ticket_types").UpdateOne(tx, bson.M{"public_id": item.TicketTypeID, "reserved": bson.M{"$gte": item.Quantity}}, bson.M{"$inc": bson.M{"reserved": -item.Quantity}, "$set": bson.M{"updated_at": now}})
				if e != nil || release.MatchedCount != 1 {
					return nil, ErrConflict
				}
			}
			return nil, s.audit(tx, "ticket_order.expire", order.PublicID, now, uuid)
		})
		session.EndSession(ctx)
		if e != nil {
			return expired, e
		}
		expired++
	}
	return expired, nil
}
func (s *MongoStore) items(ctx context.Context, orderID string) ([]itemDocument, error) {
	cursor, err := s.db.Collection("ticket_order_items").Find(ctx, bson.M{"order_id": orderID})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var items []itemDocument
	err = cursor.All(ctx, &items)
	return items, err
}
func (s *MongoStore) ReconcileLatePayment(ctx context.Context, reference string, now time.Time, hold time.Duration, trusted bool) (LatePaymentResult, error) {
	if !trusted {
		return "", ErrForbidden
	}
	session, err := s.db.Client().StartSession()
	if err != nil {
		return "", err
	}
	defer session.EndSession(ctx)
	result := LatePaymentAlreadyActive
	orderID := ""
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
		var order orderDocument
		if e := s.db.Collection("ticket_orders").FindOne(tx, bson.M{"reference": reference}).Decode(&order); e != nil {
			return nil, e
		}
		orderID = order.PublicID
		if order.Status != StatusExpired {
			return nil, nil
		}
		items, e := s.items(tx, order.PublicID)
		if e != nil {
			return nil, e
		}
		for _, item := range items {
			claim, e := s.db.Collection("ticket_types").UpdateOne(tx, bson.M{"public_id": item.TicketTypeID, "$expr": bson.M{"$lte": bson.A{bson.M{"$add": bson.A{"$sold", "$reserved", item.Quantity}}, "$capacity"}}}, bson.M{"$inc": bson.M{"reserved": item.Quantity}, "$set": bson.M{"updated_at": now}})
			if e != nil || claim.MatchedCount != 1 {
				return nil, ErrConflict
			}
		}
		updated, e := s.db.Collection("ticket_orders").UpdateOne(tx, bson.M{"public_id": order.PublicID, "status": StatusExpired}, bson.M{"$set": bson.M{"status": StatusAwaitingPayment, "hold_expires_at": now.Add(hold), "updated_at": now}})
		if e != nil || updated.MatchedCount != 1 {
			return nil, ErrConflict
		}
		result = LatePaymentRestored
		return nil, s.audit(tx, "ticket_order.late_payment_restore", order.PublicID, now, uuid)
	})
	if errors.Is(err, ErrConflict) {
		reviewSession, e := s.db.Client().StartSession()
		if e != nil {
			return "", e
		}
		defer reviewSession.EndSession(ctx)
		_, e = reviewSession.WithTransaction(ctx, func(tx context.Context) (any, error) {
			updated, e := s.db.Collection("ticket_orders").UpdateOne(tx, bson.M{"public_id": orderID, "status": StatusExpired}, bson.M{"$set": bson.M{"status": StatusReconciliationRequired, "updated_at": now}})
			if e != nil || updated.MatchedCount != 1 {
				return nil, ErrConflict
			}
			return nil, s.audit(tx, "ticket_order.late_payment_review", orderID, now, uuid)
		})
		if e != nil {
			return "", e
		}
		return LatePaymentReview, nil
	}
	return result, err
}
func (s *MongoStore) audit(ctx context.Context, action, entity string, now time.Time, id func() (string, error)) error {
	publicID, err := id()
	if err != nil {
		return err
	}
	_, err = s.db.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": publicID, "actor_id": bson.NilObjectID, "action": action, "entity_type": "ticket_order", "entity_id": entity, "metadata": bson.M{}, "created_at": now})
	return err
}

var _ Store = (*MongoStore)(nil)
