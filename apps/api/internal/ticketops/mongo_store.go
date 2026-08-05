package ticketops

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct {
	db *mongo.Database
	id func() (string, error)
}

func NewMongoStore(db *mongo.Database, id func() (string, error)) *MongoStore {
	return &MongoStore{db: db, id: id}
}
func mapErr(err error) error {
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	if mongo.IsDuplicateKeyError(err) {
		return ErrConflict
	}
	return err
}
func (s *MongoStore) tx(ctx context.Context, fn func(context.Context) error) error {
	session, e := s.db.Client().StartSession()
	if e != nil {
		return e
	}
	defer session.EndSession(ctx)
	_, e = session.WithTransaction(ctx, func(tx context.Context) (any, error) { return nil, fn(tx) })
	return e
}
func (s *MongoStore) audit(ctx context.Context, actor, action, entity string, at time.Time) error {
	id, e := s.id()
	if e != nil {
		return e
	}
	actorID, e := bson.ObjectIDFromHex(actor)
	if e != nil {
		return ErrForbidden
	}
	_, e = s.db.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": id, "actor_id": actorID, "action": action, "entity_type": "ticket_operation", "entity_id": entity, "metadata": bson.M{}, "created_at": at})
	return e
}
func (s *MongoStore) ListOrders(ctx context.Context, f OrderFilter) ([]OrderView, []Summary, error) {
	filter := bson.M{}
	allowedStatus := map[string]bool{"pending": true, "awaiting_payment": true, "paid": true, "payment_failed": true, "expired": true, "cancelled": true, "reconciliation_required": true, "partially_refunded": true, "refunded": true}
	if f.Status != "" && !allowedStatus[f.Status] {
		return nil, nil, ErrInvalid
	}
	if len(strings.TrimSpace(f.Query)) > 254 {
		return nil, nil, ErrInvalid
	}
	if f.EventID != "" {
		if !validUUID(f.EventID) {
			return nil, nil, ErrInvalid
		}
		var event struct {
			ID bson.ObjectID `bson:"_id"`
		}
		if e := s.db.Collection("events").FindOne(ctx, bson.M{"public_id": f.EventID}).Decode(&event); e != nil {
			return nil, nil, mapErr(e)
		}
		filter["event_id"] = bson.M{"$in": bson.A{f.EventID, event.ID}}
	}
	if f.Status != "" {
		filter["status"] = f.Status
	}
	if f.Query != "" {
		q := regexp.QuoteMeta(strings.TrimSpace(f.Query))
		filter["$or"] = bson.A{bson.M{"reference": bson.M{"$regex": q, "$options": "i"}}, bson.M{"buyer_email": bson.M{"$regex": q, "$options": "i"}}}
	}
	if f.DateFrom != "" || f.DateTo != "" {
		rangeFilter := bson.M{}
		var from, to time.Time
		if f.DateFrom != "" {
			value, err := time.Parse("2006-01-02", f.DateFrom)
			if err != nil {
				return nil, nil, ErrInvalid
			}
			rangeFilter["$gte"] = value.UTC()
			from = value
		}
		if f.DateTo != "" {
			value, err := time.Parse("2006-01-02", f.DateTo)
			if err != nil {
				return nil, nil, ErrInvalid
			}
			rangeFilter["$lt"] = value.UTC().Add(24 * time.Hour)
			to = value
		}
		if !from.IsZero() && !to.IsZero() && from.After(to) {
			return nil, nil, ErrInvalid
		}
		filter["created_at"] = rangeFilter
	}
	cursor, e := s.db.Collection("ticket_orders").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(500))
	if e != nil {
		return nil, nil, e
	}
	defer cursor.Close(ctx)
	var docs []struct {
		PublicID              string `bson:"public_id"`
		Reference             string `bson:"reference"`
		EventID               string `bson:"event_id"`
		BuyerName             string `bson:"buyer_name"`
		BuyerEmail            string `bson:"buyer_email"`
		Currency              string `bson:"currency"`
		Subtotal, Fees, Total bson.Decimal128
		Status                string    `bson:"status"`
		CreatedAt             time.Time `bson:"created_at"`
	}
	if e = cursor.All(ctx, &docs); e != nil {
		return nil, nil, e
	}
	items := make([]OrderView, len(docs))
	groups := map[string]*Summary{}
	orderIDs := make(bson.A, 0, len(docs))
	for i, d := range docs {
		orderIDs = append(orderIDs, d.PublicID)
		items[i] = OrderView{ID: d.PublicID, Reference: d.Reference, EventID: d.EventID, BuyerName: d.BuyerName, BuyerEmail: d.BuyerEmail, Currency: d.Currency, Subtotal: d.Subtotal.String(), Fees: d.Fees.String(), Total: d.Total.String(), Refunded: "0.00", Status: d.Status, CreatedAt: d.CreatedAt}
		g := groups[d.Currency]
		if g == nil {
			g = &Summary{Currency: d.Currency, Revenue: "0.00", Fees: "0.00", Refunded: "0.00", Net: "0.00"}
			groups[d.Currency] = g
		}
		g.Orders++
		if d.Status == "paid" || d.Status == "partially_refunded" || d.Status == "refunded" {
			rv, _ := minor(d.Total.String())
			fv, _ := minor(d.Fees.String())
			gr, _ := minor(g.Revenue)
			gf, _ := minor(g.Fees)
			g.Revenue = moneyString(gr + rv)
			g.Fees = moneyString(gf + fv)
		}
	}
	var refunds []struct {
		OrderID  string          `bson:"order_public_id"`
		Amount   bson.Decimal128 `bson:"amount"`
		Currency string          `bson:"currency"`
		Status   string          `bson:"status"`
	}
	if len(orderIDs) > 0 {
		rc, refundErr := s.db.Collection("ticket_refunds").Find(ctx, bson.M{"order_public_id": bson.M{"$in": orderIDs}, "status": bson.M{"$in": bson.A{"pending", "succeeded"}}})
		if refundErr != nil {
			return nil, nil, refundErr
		}
		if refundErr = rc.All(ctx, &refunds); refundErr != nil {
			return nil, nil, refundErr
		}
		_ = rc.Close(ctx)
	}
	for _, r := range refunds {
		a, _ := minor(r.Amount.String())
		g := groups[r.Currency]
		if g != nil {
			x, _ := minor(g.Refunded)
			g.Refunded = moneyString(x + a)
		}
		for i := range items {
			if items[i].ID == r.OrderID {
				x, _ := minor(items[i].Refunded)
				items[i].Refunded = moneyString(x + a)
			}
		}
	}
	summaries := []Summary{}
	for _, g := range groups {
		r, _ := minor(g.Revenue)
		f, _ := minor(g.Fees)
		x, _ := minor(g.Refunded)
		g.Net = moneyString(r - f - x)
		summaries = append(summaries, *g)
	}
	return items, summaries, nil
}
func (s *MongoStore) Resend(ctx context.Context, id, actor string, at time.Time) error {
	return s.tx(ctx, func(tx context.Context) error {
		var o struct {
			ID     bson.ObjectID `bson:"_id"`
			Status string        `bson:"status"`
		}
		if e := s.db.Collection("ticket_orders").FindOne(tx, bson.M{"public_id": id}).Decode(&o); e != nil {
			return mapErr(e)
		}
		if o.Status != "paid" && o.Status != "partially_refunded" {
			return ErrConflict
		}
		r, e := s.db.Collection("ticket_delivery_outbox").UpdateOne(tx, bson.M{"order_id": o.ID}, bson.M{"$set": bson.M{"status": "pending", "attempts": 0, "next_attempt_at": at, "updated_at": at}, "$unset": bson.M{"sent_at": "", "dead_lettered_at": "", "last_error_code": "", "claimed_at": "", "claim_token": ""}})
		if e != nil || r.MatchedCount != 1 {
			return ErrNotFound
		}
		return s.audit(tx, actor, "ticket.order.resend", id, at)
	})
}
func (s *MongoStore) VoidTicket(ctx context.Context, id, reason, actor string, at time.Time) error {
	return s.tx(ctx, func(tx context.Context) error {
		r, e := s.db.Collection("issued_tickets").UpdateOne(tx, bson.M{"public_id": id, "status": "valid"}, bson.M{"$set": bson.M{"status": "void", "voided_at": at, "void_reason": reason}})
		if e != nil {
			return e
		}
		if r.MatchedCount != 1 {
			return ErrConflict
		}
		return s.audit(tx, actor, "ticket.void", id, at)
	})
}
func (s *MongoStore) BeginRefund(ctx context.Context, in RefundInput, actor, provider string, at time.Time) (out Refund, paymentRef string, err error) {
	err = s.tx(ctx, func(tx context.Context) error {
		var existing struct {
			PublicID          string          `bson:"public_id"`
			OrderPublicID     string          `bson:"order_public_id"`
			Amount            bson.Decimal128 `bson:"amount"`
			Currency          string          `bson:"currency"`
			Reason            string          `bson:"reason"`
			Provider          string          `bson:"provider"`
			ProviderReference string          `bson:"provider_reference"`
			Status            string          `bson:"status"`
			CreatedAt         time.Time       `bson:"created_at"`
			UpdatedAt         time.Time       `bson:"updated_at"`
		}
		if e := s.db.Collection("ticket_refunds").FindOne(tx, bson.M{"idempotency_hash": in.IdempotencyKey}).Decode(&existing); e == nil {
			out = Refund{ID: existing.PublicID, OrderID: existing.OrderPublicID, Amount: existing.Amount.String(), Currency: existing.Currency, Reason: existing.Reason, Provider: existing.Provider, ProviderReference: existing.ProviderReference, Status: existing.Status, CreatedAt: existing.CreatedAt, UpdatedAt: existing.UpdatedAt, Replay: true}
			return nil
		} else if !errors.Is(e, mongo.ErrNoDocuments) {
			return e
		}
		var order struct {
			PublicID         string          `bson:"public_id"`
			Currency         string          `bson:"currency"`
			Status           string          `bson:"status"`
			PaymentReference string          `bson:"payment_reference"`
			Total            bson.Decimal128 `bson:"total"`
		}
		if e := s.db.Collection("ticket_orders").FindOne(tx, bson.M{"public_id": in.OrderID}).Decode(&order); e != nil {
			return mapErr(e)
		}
		if order.Status != "paid" && order.Status != "partially_refunded" {
			return ErrConflict
		}
		want, _ := minor(in.Amount)
		total, _ := minor(order.Total.String())
		var prior []struct{ Amount bson.Decimal128 }
		c, e := s.db.Collection("ticket_refunds").Find(tx, bson.M{"order_public_id": in.OrderID, "status": bson.M{"$in": bson.A{"processing", "pending", "succeeded"}}})
		if e != nil {
			return e
		}
		_ = c.All(tx, &prior)
		_ = c.Close(tx)
		for _, p := range prior {
			x, _ := minor(p.Amount.String())
			total -= x
		}
		if want > total {
			return ErrConflict
		}
		id, e := s.id()
		if e != nil {
			return e
		}
		amount, e := bson.ParseDecimal128(in.Amount)
		if e != nil {
			return ErrInvalid
		}
		doc := bson.M{"public_id": id, "order_public_id": in.OrderID, "amount": amount, "currency": order.Currency, "reason": in.Reason, "provider": provider, "provider_reference": "", "idempotency_hash": in.IdempotencyKey, "status": "processing", "created_at": at, "updated_at": at}
		if _, e = s.db.Collection("ticket_refunds").InsertOne(tx, doc); e != nil {
			return e
		}
		if e = s.audit(tx, actor, "ticket.refund.approved", id, at); e != nil {
			return e
		}
		out = Refund{ID: id, OrderID: in.OrderID, Amount: in.Amount, Currency: order.Currency, Reason: in.Reason, Provider: provider, Status: "processing", CreatedAt: at, UpdatedAt: at}
		paymentRef = order.PaymentReference
		return nil
	})
	if mongo.IsDuplicateKeyError(err) {
		var existing struct {
			PublicID          string          `bson:"public_id"`
			OrderPublicID     string          `bson:"order_public_id"`
			Amount            bson.Decimal128 `bson:"amount"`
			Currency          string          `bson:"currency"`
			Reason            string          `bson:"reason"`
			Provider          string          `bson:"provider"`
			ProviderReference string          `bson:"provider_reference"`
			Status            string          `bson:"status"`
			CreatedAt         time.Time       `bson:"created_at"`
			UpdatedAt         time.Time       `bson:"updated_at"`
		}
		if e := s.db.Collection("ticket_refunds").FindOne(ctx, bson.M{"idempotency_hash": in.IdempotencyKey}).Decode(&existing); e == nil {
			out = Refund{ID: existing.PublicID, OrderID: existing.OrderPublicID, Amount: existing.Amount.String(), Currency: existing.Currency, Reason: existing.Reason, Provider: existing.Provider, ProviderReference: existing.ProviderReference, Status: existing.Status, CreatedAt: existing.CreatedAt, UpdatedAt: existing.UpdatedAt, Replay: true}
			return out, "", nil
		}
	}
	return
}
func (s *MongoStore) CompleteRefund(ctx context.Context, id, status, reference, errorCode, actor string, at time.Time) (out Refund, err error) {
	mapped := "pending"
	if status == "succeeded" {
		mapped = "succeeded"
	}
	if status == "provider_failed" {
		mapped = "provider_failed"
	}
	err = s.tx(ctx, func(tx context.Context) error {
		r, e := s.db.Collection("ticket_refunds").UpdateOne(tx, bson.M{"public_id": id, "status": "processing"}, bson.M{"$set": bson.M{"status": mapped, "provider_reference": reference, "error_code": errorCode, "updated_at": at}})
		if e != nil {
			return e
		}
		if r.MatchedCount != 1 {
			return ErrConflict
		}
		var d struct {
			PublicID          string          `bson:"public_id"`
			OrderPublicID     string          `bson:"order_public_id"`
			Amount            bson.Decimal128 `bson:"amount"`
			Currency          string          `bson:"currency"`
			Reason            string          `bson:"reason"`
			Provider          string          `bson:"provider"`
			ProviderReference string          `bson:"provider_reference"`
			Status            string          `bson:"status"`
			CreatedAt         time.Time       `bson:"created_at"`
			UpdatedAt         time.Time       `bson:"updated_at"`
		}
		if e = s.db.Collection("ticket_refunds").FindOne(tx, bson.M{"public_id": id}).Decode(&d); e != nil {
			return e
		}
		out = Refund{ID: d.PublicID, OrderID: d.OrderPublicID, Amount: d.Amount.String(), Currency: d.Currency, Reason: d.Reason, Provider: d.Provider, ProviderReference: d.ProviderReference, Status: d.Status, CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt}
		return s.audit(tx, actor, "ticket.refund.provider_result", id, at)
	})
	return out, err
}
func (s *MongoStore) Attendees(ctx context.Context, eventID, actor string, at time.Time) ([]Attendee, error) {
	var event struct {
		ID bson.ObjectID `bson:"_id"`
	}
	if e := s.db.Collection("events").FindOne(ctx, bson.M{"public_id": eventID}).Decode(&event); e != nil {
		return nil, mapErr(e)
	}
	cursor, e := s.db.Collection("issued_tickets").Find(ctx, bson.M{"event_id": event.ID})
	if e != nil {
		return nil, e
	}
	defer cursor.Close(ctx)
	var docs []struct {
		PublicID     string        `bson:"public_id"`
		OrderID      bson.ObjectID `bson:"order_id"`
		TicketTypeID bson.ObjectID `bson:"ticket_type_id"`
		AttendeeName *string       `bson:"attendee_name"`
		Status       string        `bson:"status"`
	}
	if e = cursor.All(ctx, &docs); e != nil {
		return nil, e
	}
	items := make([]Attendee, 0, len(docs))
	ticketTypes := map[bson.ObjectID]string{}
	if len(docs) > 0 {
		ids := make(bson.A, 0, len(docs))
		seen := map[bson.ObjectID]bool{}
		for _, d := range docs {
			if !seen[d.TicketTypeID] {
				seen[d.TicketTypeID] = true
				ids = append(ids, d.TicketTypeID)
			}
		}
		var rows []struct {
			ID       bson.ObjectID `bson:"_id"`
			PublicID string        `bson:"public_id"`
		}
		types, findErr := s.db.Collection("ticket_types").Find(ctx, bson.M{"_id": bson.M{"$in": ids}})
		if findErr != nil {
			return nil, findErr
		}
		if findErr = types.All(ctx, &rows); findErr != nil {
			return nil, findErr
		}
		_ = types.Close(ctx)
		for _, row := range rows {
			ticketTypes[row.ID] = row.PublicID
		}
	}
	for _, d := range docs {
		var o struct {
			Reference  string `bson:"reference"`
			BuyerName  string `bson:"buyer_name"`
			BuyerEmail string `bson:"buyer_email"`
		}
		if e = s.db.Collection("ticket_orders").FindOne(ctx, bson.M{"_id": d.OrderID}).Decode(&o); e != nil {
			return nil, e
		}
		name := ""
		if d.AttendeeName != nil {
			name = *d.AttendeeName
		}
		ticketTypeID := ticketTypes[d.TicketTypeID]
		if ticketTypeID == "" {
			return nil, ErrNotFound
		}
		items = append(items, Attendee{TicketID: d.PublicID, OrderReference: o.Reference, TicketTypeID: ticketTypeID, AttendeeName: name, BuyerName: o.BuyerName, BuyerEmail: o.BuyerEmail, Status: d.Status})
	}
	if e = s.audit(ctx, actor, "ticket.attendees.export", eventID, at); e != nil {
		return nil, e
	}
	return items, nil
}
func (s *MongoStore) CancelEvent(ctx context.Context, eventID, reason, actor string, at time.Time) (count int, err error) {
	err = s.tx(ctx, func(tx context.Context) error {
		var event struct {
			ID bson.ObjectID `bson:"_id"`
		}
		if e := s.db.Collection("events").FindOne(tx, bson.M{"public_id": eventID, "status": bson.M{"$in": bson.A{"published", "scheduled", "draft"}}}).Decode(&event); e != nil {
			return mapErr(e)
		}
		r, e := s.db.Collection("events").UpdateOne(tx, bson.M{"_id": event.ID, "status": bson.M{"$in": bson.A{"published", "scheduled", "draft"}}}, bson.M{"$set": bson.M{"status": "cancelled", "cancelled_at": at, "updated_at": at}})
		if e != nil {
			return e
		}
		if r.MatchedCount != 1 {
			return ErrConflict
		}
		// JK-021 writes the public event UUID. The ObjectID alternative keeps
		// legacy bootstrap orders eligible until all deployed data is evolved.
		cursor, e := s.db.Collection("ticket_orders").Find(tx, bson.M{"event_id": bson.M{"$in": bson.A{eventID, event.ID}}, "status": bson.M{"$in": bson.A{"paid", "partially_refunded"}}})
		if e != nil {
			return e
		}
		var orders []struct {
			ID        bson.ObjectID `bson:"_id"`
			PublicID  string        `bson:"public_id"`
			Reference string        `bson:"reference"`
		}
		if e = cursor.All(tx, &orders); e != nil {
			return e
		}
		for _, o := range orders {
			id, e := s.id()
			if e != nil {
				return e
			}
			_, e = s.db.Collection("ticket_communications").InsertOne(tx, bson.M{"public_id": id, "order_id": o.ID, "order_reference": o.Reference, "kind": "event.cancelled_refund_guidance", "status": "pending", "reason": reason, "attempts": 0, "next_attempt_at": at, "created_at": at, "updated_at": at})
			if e != nil {
				return e
			}
		}
		count = len(orders)
		return s.audit(tx, actor, "event.cancel", eventID, at)
	})
	return
}

var _ Store = (*MongoStore)(nil)
