package issuance

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

var (
	ErrInvalid   = errors.New("invalid ticket access")
	ErrForbidden = errors.New("ticket access denied")
	ErrNotReady  = errors.New("tickets are not ready")
)

type Line struct {
	OrderItemID, TicketTypeID bson.ObjectID
	Quantity                  int
}

type Issuer interface {
	IssuePaid(context.Context, bson.ObjectID, bson.ObjectID, string, string, []Line, time.Time) error
}

type MongoIssuer struct {
	db  *mongo.Database
	key []byte
	id  func() (string, error)
}

func NewMongoIssuer(db *mongo.Database, key []byte) (*MongoIssuer, error) {
	if db == nil || len(key) < 32 {
		return nil, ErrInvalid
	}
	return &MongoIssuer{db: db, key: append([]byte(nil), key...), id: uuid}, nil
}

// IssuePaid is called with the payment webhook transaction context. Its writes
// therefore commit or roll back with Paid and the reserved-to-sold movement.
func (i *MongoIssuer) IssuePaid(ctx context.Context, orderID, eventID bson.ObjectID, orderPublicID, reference string, lines []Line, now time.Time) error {
	want := 0
	for _, line := range lines {
		if line.Quantity < 1 || line.OrderItemID.IsZero() || line.TicketTypeID.IsZero() {
			return ErrInvalid
		}
		want += line.Quantity
	}
	if want < 1 || want > 1000 {
		return ErrInvalid
	}
	existing, err := i.db.Collection("issued_tickets").CountDocuments(ctx, bson.M{"order_id": orderID})
	if err != nil {
		return err
	}
	if existing > 0 {
		if existing != int64(want) {
			return fmt.Errorf("issued ticket count %d does not match admissions %d", existing, want)
		}
		return nil
	}
	docs := make([]any, 0, want)
	for _, line := range lines {
		for range line.Quantity {
			publicID, idErr := i.id()
			if idErr != nil {
				return idErr
			}
			bearer := i.ticketBearer(publicID)
			docs = append(docs, bson.M{"public_id": publicID, "order_id": orderID, "order_item_id": line.OrderItemID, "event_id": eventID, "ticket_type_id": line.TicketTypeID, "attendee_name": nil, "qr_token_hash": sha256Hex(bearer), "status": "valid", "created_at": now})
		}
	}
	if _, err = i.db.Collection("issued_tickets").InsertMany(ctx, docs); err != nil {
		return err
	}
	access := i.orderBearer(orderPublicID)
	expires := now.Add(30 * 24 * time.Hour)
	result, err := i.db.Collection("ticket_orders").UpdateOne(ctx, bson.M{"_id": orderID}, bson.M{"$set": bson.M{"ticket_access_hash": sha256Hex(access), "ticket_access_expires_at": expires, "updated_at": now}})
	if err != nil || result.MatchedCount != 1 {
		return fmt.Errorf("persist ticket access: %w", err)
	}
	outboxID, err := i.id()
	if err != nil {
		return err
	}
	_, err = i.db.Collection("ticket_delivery_outbox").InsertOne(ctx, bson.M{"public_id": outboxID, "order_id": orderID, "order_reference": reference, "kind": "ticket.purchase_confirmation", "status": "pending", "attempts": 0, "next_attempt_at": now, "created_at": now, "updated_at": now})
	if err != nil {
		return err
	}
	auditID, err := i.id()
	if err != nil {
		return err
	}
	_, err = i.db.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": auditID, "actor_id": bson.NilObjectID, "action": "ticket.issued", "entity_type": "ticket_order", "entity_id": orderPublicID, "metadata": bson.M{"admissions": want}, "created_at": now})
	return err
}

func (i *MongoIssuer) TicketBearer(publicID string) string { return i.ticketBearer(publicID) }
func (i *MongoIssuer) OrderBearer(orderID string) string   { return i.orderBearer(orderID) }
func (i *MongoIssuer) ticketBearer(id string) string       { return signedBearer("jkt1", id, i.key) }
func (i *MongoIssuer) orderBearer(id string) string        { return signedBearer("jka1", id, i.key) }

func signedBearer(prefix, id string, key []byte) string {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(prefix + ":" + id))
	return prefix + "." + base64.RawURLEncoding.EncodeToString([]byte(id)) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func uuid() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}

func MaskEmail(value string) string {
	parts := strings.Split(value, "@")
	if len(parts) != 2 || parts[0] == "" {
		return "***"
	}
	return string([]rune(parts[0])[0]) + "***@" + parts[1]
}
