package issuance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type TicketView struct {
	PublicID     string `json:"id"`
	TicketTypeID string `json:"ticket_type_id"`
	Status       string `json:"status"`
	QRBearer     string `json:"qr_bearer"`
}
type Confirmation struct {
	Reference  string       `json:"reference"`
	Status     string       `json:"status"`
	BuyerEmail string       `json:"buyer_email_masked"`
	ExpiresAt  time.Time    `json:"access_expires_at"`
	Tickets    []TicketView `json:"tickets"`
}

func (i *MongoIssuer) Confirmation(ctx context.Context, reference, token string, now time.Time) (Confirmation, error) {
	if token == "" || len(token) > 512 {
		return Confirmation{}, ErrInvalid
	}
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])
	var order struct {
		ID            bson.ObjectID `bson:"_id"`
		PublicID      string        `bson:"public_id"`
		Reference     string        `bson:"reference"`
		Status        string        `bson:"status"`
		BuyerEmail    string        `bson:"buyer_email"`
		Idempotency   string        `bson:"idempotency_hash"`
		TicketAccess  string        `bson:"ticket_access_hash"`
		AccessExpires time.Time     `bson:"ticket_access_expires_at"`
	}
	err := i.db.Collection("ticket_orders").FindOne(ctx, bson.M{"reference": reference}).Decode(&order)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return Confirmation{}, ErrForbidden
	}
	if err != nil {
		return Confirmation{}, err
	}
	if hash != order.Idempotency && hash != order.TicketAccess {
		return Confirmation{}, ErrForbidden
	}
	if order.Status != "paid" {
		return Confirmation{}, ErrNotReady
	}
	if !order.AccessExpires.After(now) {
		return Confirmation{}, ErrForbidden
	}
	var docs []struct {
		PublicID     string        `bson:"public_id"`
		TicketTypeID bson.ObjectID `bson:"ticket_type_id"`
		Status       string        `bson:"status"`
	}
	cursor, err := i.db.Collection("issued_tickets").Find(ctx, bson.M{"order_id": order.ID})
	if err != nil {
		return Confirmation{}, err
	}
	if err = cursor.All(ctx, &docs); err != nil {
		return Confirmation{}, err
	}
	if len(docs) == 0 {
		return Confirmation{}, ErrNotReady
	}
	tickets := make([]TicketView, len(docs))
	for index, doc := range docs {
		tickets[index] = TicketView{PublicID: doc.PublicID, TicketTypeID: doc.TicketTypeID.Hex(), Status: doc.Status, QRBearer: i.ticketBearer(doc.PublicID)}
	}
	return Confirmation{Reference: order.Reference, Status: order.Status, BuyerEmail: MaskEmail(order.BuyerEmail), ExpiresAt: order.AccessExpires, Tickets: tickets}, nil
}
