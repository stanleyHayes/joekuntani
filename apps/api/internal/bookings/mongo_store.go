package bookings

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ db *mongo.Database }

func NewMongoStore(db *mongo.Database) *MongoStore { return &MongoStore{db: db} }

type bookingDoc struct {
	PublicID     string            `bson:"public_id"`
	EnquiryID    string            `bson:"enquiry_id"`
	Title        string            `bson:"title"`
	ServiceID    string            `bson:"service_id"`
	Venue        string            `bson:"venue"`
	City         string            `bson:"city"`
	Country      string            `bson:"country"`
	StartAt      time.Time         `bson:"start_at"`
	EndAt        time.Time         `bson:"end_at"`
	Status       Status            `bson:"status"`
	Fee          bson.Decimal128   `bson:"fee"`
	Currency     string            `bson:"currency"`
	Requirements map[string]string `bson:"requirements"`
	Version      int64             `bson:"version"`
	DeletedAt    *time.Time        `bson:"deleted_at"`
	CreatedAt    time.Time         `bson:"created_at"`
	UpdatedAt    time.Time         `bson:"updated_at"`
}

func (d bookingDoc) booking() Booking {
	return Booking{ID: d.PublicID, EnquiryID: d.EnquiryID, Title: d.Title, ServiceID: d.ServiceID, Venue: d.Venue, City: d.City, Country: d.Country, StartAt: d.StartAt, EndAt: d.EndAt, Status: d.Status, Fee: d.Fee.String(), Currency: d.Currency, Requirements: d.Requirements, Version: d.Version, DeletedAt: d.DeletedAt, CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt}
}
func doc(v Booking) bson.M {
	fee, _ := bson.ParseDecimal128(v.Fee)
	return bson.M{"public_id": v.ID, "enquiry_id": v.EnquiryID, "title": v.Title, "service_id": v.ServiceID, "start_at": v.StartAt, "end_at": v.EndAt, "venue": v.Venue, "city": v.City, "country": v.Country, "status": v.Status, "fee": fee, "currency": v.Currency, "requirements": v.Requirements, "version": v.Version, "created_at": v.CreatedAt, "updated_at": v.UpdatedAt}
}
func (s *MongoStore) Create(ctx context.Context, v Booking, actor string) (Booking, []Warning, error) {
	err := s.tx(ctx, func(tx context.Context) error {
		if err := s.references(tx, v.EnquiryID, v.ServiceID); err != nil {
			return err
		}
		if _, err := s.db.Collection("bookings").InsertOne(tx, doc(v)); err != nil {
			return err
		}
		return s.audit(tx, actor, "booking.create", v.ID, v.Status, v.UpdatedAt)
	})
	if err != nil {
		return Booking{}, nil, err
	}
	warnings, err := s.overlaps(ctx, v.ID, v.StartAt, v.EndAt)
	return v, warnings, err
}
func (s *MongoStore) Update(ctx context.Context, id string, in Input, actor string, now time.Time) (Booking, []Warning, error) {
	var out Booking
	err := s.tx(ctx, func(tx context.Context) error {
		var current bookingDoc
		if err := s.db.Collection("bookings").FindOne(tx, bson.M{"public_id": id, "deleted_at": bson.M{"$exists": false}}).Decode(&current); err != nil {
			return mapErr(err)
		}
		if current.Version != in.Version {
			return ErrConflict
		}
		if !transition(current.Status, in.Status) {
			return ErrConflict
		}
		if err := s.references(tx, in.EnquiryID, in.ServiceID); err != nil {
			return err
		}
		fee, _ := bson.ParseDecimal128(in.Fee)
		set := bson.M{"enquiry_id": in.EnquiryID, "title": in.Title, "service_id": in.ServiceID, "start_at": in.StartAt.UTC(), "end_at": in.EndAt.UTC(), "venue": in.Venue, "city": in.City, "country": in.Country, "status": in.Status, "fee": fee, "currency": in.Currency, "requirements": in.Requirements, "version": in.Version + 1, "updated_at": now}
		res, err := s.db.Collection("bookings").UpdateOne(tx, bson.M{"public_id": id, "version": in.Version, "deleted_at": bson.M{"$exists": false}}, bson.M{"$set": set})
		if err != nil {
			return err
		}
		if res.MatchedCount != 1 {
			return ErrConflict
		}
		current.EnquiryID, current.Title, current.ServiceID, current.Venue, current.City, current.Country = in.EnquiryID, in.Title, in.ServiceID, in.Venue, in.City, in.Country
		current.StartAt, current.EndAt, current.Status, current.Fee, current.Currency, current.Requirements, current.Version, current.UpdatedAt = in.StartAt.UTC(), in.EndAt.UTC(), in.Status, fee, in.Currency, in.Requirements, in.Version+1, now
		out = current.booking()
		return s.audit(tx, actor, "booking.update", id, in.Status, now)
	})
	if err != nil {
		return Booking{}, nil, err
	}
	warnings, err := s.overlaps(ctx, id, out.StartAt, out.EndAt)
	return out, warnings, err
}
func (s *MongoStore) List(ctx context.Context, f Filter) ([]Booking, error) {
	filter := bson.M{"deleted_at": bson.M{"$exists": false}, "start_at": bson.M{"$lt": f.To}, "end_at": bson.M{"$gt": f.From}}
	if f.Status != "" {
		filter["status"] = f.Status
	}
	cur, err := s.db.Collection("bookings").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "start_at", Value: 1}}))
	if err != nil {
		return nil, err
	}
	var docs []bookingDoc
	if err = cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	items := make([]Booking, len(docs))
	for i, d := range docs {
		items[i] = d.booking()
	}
	return items, nil
}
func (s *MongoStore) SoftDelete(ctx context.Context, id string, version int64, actor string, now time.Time) error {
	return s.tx(ctx, func(tx context.Context) error {
		res, err := s.db.Collection("bookings").UpdateOne(tx, bson.M{"public_id": id, "version": version, "status": "cancelled", "deleted_at": bson.M{"$exists": false}}, bson.M{"$set": bson.M{"deleted_at": now, "updated_at": now, "version": version + 1}})
		if err != nil {
			return err
		}
		if res.MatchedCount != 1 {
			return ErrConflict
		}
		return s.audit(tx, actor, "booking.delete", id, Cancelled, now)
	})
}

// defaultBusinessTimezone mirrors the starter value the settings service hands
// out before anyone has published (see settings.StarterValues). The calendar is
// unusable without a zone, so an unconfigured install falls back here rather
// than failing the whole read.
const (
	defaultBusinessTimezone = "Africa/Accra"
	settingsCollection      = "global_settings"
	settingsGlobalKey       = "global"
)

func (s *MongoStore) Timezone(ctx context.Context) (string, error) {
	var row struct {
		Published *struct {
			Team struct {
				BusinessTimezone string `bson:"business_timezone"`
			} `bson:"team"`
		} `bson:"published"`
	}
	// `global_settings` is the collection the settings service owns. The older
	// `site_settings` bootstrap collection has an unrelated key/value shape and
	// never carries a business timezone, so reading it always failed here.
	err := s.db.Collection(settingsCollection).FindOne(ctx, bson.M{"key": settingsGlobalKey}).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return defaultBusinessTimezone, nil
	}
	if err != nil {
		return "", err
	}
	if row.Published == nil || row.Published.Team.BusinessTimezone == "" {
		return defaultBusinessTimezone, nil
	}
	return row.Published.Team.BusinessTimezone, nil
}
func (s *MongoStore) references(ctx context.Context, enquiry, service string) error {
	n, err := s.db.Collection("crm_enquiries").CountDocuments(ctx, bson.M{"public_id": enquiry, "deleted_at": bson.M{"$exists": false}})
	if err != nil || n != 1 {
		return ErrInvalid
	}
	n, err = s.db.Collection("services").CountDocuments(ctx, bson.M{"public_id": service, "active": true, "retired_at": bson.M{"$exists": false}})
	if err != nil || n != 1 {
		return ErrInvalid
	}
	return nil
}
func (s *MongoStore) overlaps(ctx context.Context, id string, start, end time.Time) ([]Warning, error) {
	cur, err := s.db.Collection("bookings").Find(ctx, bson.M{"public_id": bson.M{"$ne": id}, "deleted_at": bson.M{"$exists": false}, "status": bson.M{"$in": bson.A{Tentative, Confirmed}}, "start_at": bson.M{"$lt": end}, "end_at": bson.M{"$gt": start}}, options.Find().SetSort(bson.D{{Key: "status", Value: 1}, {Key: "start_at", Value: 1}}))
	if err != nil {
		return nil, err
	}
	var docs []bookingDoc
	if err = cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	warnings := make([]Warning, len(docs))
	for i, d := range docs {
		warnings[i] = Warning{d.PublicID, d.Title, d.Status, d.StartAt, d.EndAt}
	}
	return warnings, nil
}
func (s *MongoStore) audit(ctx context.Context, actor, action, id string, status Status, now time.Time) error {
	aid, err := uuid()
	if err != nil {
		return err
	}
	var actorID any = nil
	if oid, e := bson.ObjectIDFromHex(actor); e == nil {
		actorID = oid
	}
	_, err = s.db.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": aid, "actor_id": actorID, "action": action, "entity_type": "booking", "entity_id": id, "metadata": bson.M{"status": status}, "created_at": now})
	return err
}
func (s *MongoStore) tx(ctx context.Context, fn func(context.Context) error) error {
	session, err := s.db.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) { return nil, fn(tx) })
	return err
}
func mapErr(err error) error {
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	return err
}
func uuid() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
