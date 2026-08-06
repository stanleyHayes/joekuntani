package checkin

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type MongoStore struct {
	db *mongo.Database
	id func() (string, error)
}

func NewMongoStore(db *mongo.Database, id func() (string, error)) *MongoStore {
	return &MongoStore{db: db, id: id}
}

func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (s *MongoStore) tx(ctx context.Context, fn func(context.Context) error) error {
	session, err := s.db.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) {
		return nil, fn(tx)
	})
	return err
}

func (s *MongoStore) CountCheckedIn(ctx context.Context, eventPublicID string) (int64, error) {
	var event struct {
		ID bson.ObjectID `bson:"_id"`
	}
	if err := s.db.Collection("events").FindOne(ctx, bson.M{"public_id": eventPublicID}).Decode(&event); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return 0, ErrNotFound
		}
		return 0, err
	}
	return s.db.Collection("issued_tickets").CountDocuments(ctx, bson.M{"event_id": event.ID, "status": "checked_in"})
}

func (s *MongoStore) Scan(ctx context.Context, actor Actor, input ScanInput, at time.Time) (ScanResult, error) {
	var out ScanResult
	err := s.tx(ctx, func(tx context.Context) error {
		actorID, err := bson.ObjectIDFromHex(actor.InternalID)
		if err != nil {
			return ErrForbidden
		}
		var event struct {
			ID bson.ObjectID `bson:"_id"`
		}
		if err = s.db.Collection("events").FindOne(tx, bson.M{"public_id": input.EventID}).Decode(&event); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				return ErrNotFound
			}
			return err
		}
		tokenHash := sha256Hex(input.Token)
		var ticket struct {
			ID       bson.ObjectID `bson:"_id"`
			PublicID string        `bson:"public_id"`
			EventID  bson.ObjectID `bson:"event_id"`
			Status   string        `bson:"status"`
		}
		findErr := s.db.Collection("issued_tickets").FindOne(tx, bson.M{"qr_token_hash": tokenHash}).Decode(&ticket)
		if errors.Is(findErr, mongo.ErrNoDocuments) {
			out = ScanResult{Result: ResultInvalid, Message: "Ticket not recognized", CheckedInCount: mustCount(tx, s, event.ID)}
			return s.recordAttempt(tx, actorID, bson.NilObjectID, event.ID, input.DeviceLabel, ResultInvalid, at)
		}
		if findErr != nil {
			return findErr
		}
		out.TicketRef = shortRef(ticket.PublicID)
		if ticket.EventID != event.ID {
			out = ScanResult{Result: ResultWrongEvent, TicketRef: out.TicketRef, Message: "Ticket belongs to a different event", CheckedInCount: mustCount(tx, s, event.ID)}
			return s.recordAttempt(tx, actorID, ticket.ID, event.ID, input.DeviceLabel, ResultWrongEvent, at)
		}
		if ticket.Status == "checked_in" {
			var existing struct {
				CheckedInAt time.Time `bson:"checked_in_at"`
			}
			_ = s.db.Collection("issued_tickets").FindOne(tx, bson.M{"_id": ticket.ID}).Decode(&existing)
			checkedAt := existing.CheckedInAt
			out = ScanResult{Result: ResultAlreadyCheckedIn, TicketRef: out.TicketRef, CheckedInAt: &checkedAt, Message: "Already checked in", CheckedInCount: mustCount(tx, s, event.ID)}
			return s.recordAttempt(tx, actorID, ticket.ID, event.ID, input.DeviceLabel, ResultAlreadyCheckedIn, at)
		}
		if ticket.Status != "valid" {
			out = ScanResult{Result: ResultNotValid, TicketRef: out.TicketRef, Message: "Ticket is not valid for admission", CheckedInCount: mustCount(tx, s, event.ID)}
			return s.recordAttempt(tx, actorID, ticket.ID, event.ID, input.DeviceLabel, ResultNotValid, at)
		}
		update, err := s.db.Collection("issued_tickets").UpdateOne(tx,
			bson.M{"_id": ticket.ID, "status": "valid", "event_id": event.ID},
			bson.M{"$set": bson.M{"status": "checked_in", "checked_in_at": at, "checked_in_by": actorID}},
		)
		if err != nil {
			return err
		}
		if update.MatchedCount != 1 {
			out = ScanResult{Result: ResultAlreadyCheckedIn, TicketRef: out.TicketRef, Message: "Already checked in", CheckedInCount: mustCount(tx, s, event.ID)}
			return ErrConflict
		}
		if err = s.recordAttempt(tx, actorID, ticket.ID, event.ID, input.DeviceLabel, ResultAdmitted, at); err != nil {
			return err
		}
		if err = s.audit(tx, actorID, ticket.PublicID, at); err != nil {
			return err
		}
		count, err := s.db.Collection("issued_tickets").CountDocuments(tx, bson.M{"event_id": event.ID, "status": "checked_in"})
		if err != nil {
			return err
		}
		checkedAt := at
		out = ScanResult{Result: ResultAdmitted, TicketRef: shortRef(ticket.PublicID), CheckedInAt: &checkedAt, CheckedInCount: count, Message: "Admitted"}
		return nil
	})
	if errors.Is(err, ErrConflict) {
		return out, ErrConflict
	}
	return out, err
}

func mustCount(ctx context.Context, s *MongoStore, eventID bson.ObjectID) int64 {
	count, err := s.db.Collection("issued_tickets").CountDocuments(ctx, bson.M{"event_id": eventID, "status": "checked_in"})
	if err != nil {
		return 0
	}
	return count
}

func (s *MongoStore) recordAttempt(ctx context.Context, actorID, ticketID, eventID bson.ObjectID, device string, result Result, at time.Time) error {
	id, err := s.id()
	if err != nil {
		return err
	}
	doc := bson.M{
		"public_id":     id,
		"ticket_id":     ticketID,
		"event_id":      eventID,
		"checked_in_by": actorID,
		"result":        string(result),
		"created_at":    at,
	}
	if device != "" {
		doc["device_label"] = device
	}
	if ticketID.IsZero() {
		// Schema requires ticket_id ObjectId; use a zero ObjectId only when unknown.
		doc["ticket_id"] = bson.NilObjectID
	}
	_, err = s.db.Collection("ticket_check_ins").InsertOne(ctx, doc)
	if mongo.IsDuplicateKeyError(err) && result == ResultAdmitted {
		return ErrConflict
	}
	return err
}

func (s *MongoStore) audit(ctx context.Context, actorID bson.ObjectID, ticketPublicID string, at time.Time) error {
	id, err := s.id()
	if err != nil {
		return err
	}
	_, err = s.db.Collection("audit_logs").InsertOne(ctx, bson.M{
		"public_id":   id,
		"actor_id":    actorID,
		"action":      "ticket.checkin",
		"entity_type": "issued_ticket",
		"entity_id":   ticketPublicID,
		"metadata":    bson.M{},
		"created_at":  at,
	})
	return err
}
