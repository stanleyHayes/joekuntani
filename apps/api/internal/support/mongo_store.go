package support

import (
	"context"
	"errors"
	"time"

	"github.com/neurodyne-corp/joe-kuntani-platform/apps/api/internal/payments"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const collectionName = "support_donations"

type MongoStore struct{ db *mongo.Database }

func NewMongoStore(db *mongo.Database) *MongoStore { return &MongoStore{db: db} }

type donationDocument struct {
	PublicID      string          `bson:"public_id"`
	Reference     string          `bson:"reference"`
	Amount        bson.Decimal128 `bson:"amount"`
	Currency      string          `bson:"currency"`
	DonorName     string          `bson:"donor_name"`
	DonorEmail    string          `bson:"donor_email"`
	Message       string          `bson:"message"`
	Anonymous     bool            `bson:"anonymous"`
	Status        string          `bson:"status"`
	Provider      string          `bson:"provider,omitempty"`
	CheckoutURL   string          `bson:"checkout_url,omitempty"`
	CheckoutID    string          `bson:"checkout_session_id,omitempty"`
	CheckoutUntil time.Time       `bson:"checkout_expires_at,omitempty"`
	AppliedEvents []string        `bson:"applied_events,omitempty"`
	CreatedAt     time.Time       `bson:"created_at"`
	UpdatedAt     time.Time       `bson:"updated_at"`
	PaidAt        *time.Time      `bson:"paid_at,omitempty"`
}

func (s *MongoStore) Create(ctx context.Context, donation Donation) error {
	amount, err := bson.ParseDecimal128(donation.Amount)
	if err != nil {
		return ErrInvalid
	}
	_, err = s.db.Collection(collectionName).InsertOne(ctx, donationDocument{
		PublicID:   donation.PublicID,
		Reference:  donation.Reference,
		Amount:     amount,
		Currency:   donation.Currency,
		DonorName:  donation.DonorName,
		DonorEmail: donation.DonorEmail,
		Message:    donation.Message,
		Anonymous:  donation.Anonymous,
		Status:     donation.Status,
		CreatedAt:  donation.CreatedAt,
		UpdatedAt:  donation.CreatedAt,
	})
	if err != nil {
		return ErrUnavailable
	}
	return nil
}

func (s *MongoStore) SaveCheckout(ctx context.Context, reference, provider string, session payments.CheckoutSession, now time.Time) error {
	result, err := s.db.Collection(collectionName).UpdateOne(ctx,
		bson.M{"reference": reference, "status": "pending"},
		bson.M{"$set": bson.M{
			"provider":            provider,
			"checkout_session_id": session.ID,
			"checkout_url":        session.URL,
			"checkout_expires_at": session.ExpiresAt,
			"updated_at":          now,
		}})
	if err != nil {
		return ErrUnavailable
	}
	if result.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// ApplyWebhook is idempotent: a provider retry carrying an event id already in
// applied_events matches nothing and reports applied=false.
func (s *MongoStore) ApplyWebhook(ctx context.Context, provider string, event payments.VerifiedEvent, bodyHash string, now time.Time) (bool, error) {
	status := ""
	switch event.Type {
	case "payment.succeeded":
		status = "paid"
	case "payment.failed":
		status = "failed"
	case "refund.succeeded":
		status = "refunded"
	default:
		// Nothing to record for events the donation lifecycle does not model.
		return false, nil
	}
	set := bson.M{
		"status":            status,
		"provider":          provider,
		"updated_at":        now,
		"last_webhook_hash": bodyHash,
	}
	if status == "paid" {
		set["paid_at"] = now
	}
	result, err := s.db.Collection(collectionName).UpdateOne(ctx,
		bson.M{"reference": event.OrderReference, "applied_events": bson.M{"$ne": event.ID}},
		bson.M{"$set": set, "$addToSet": bson.M{"applied_events": event.ID}})
	if err != nil {
		return false, ErrUnavailable
	}
	if result.MatchedCount == 0 {
		return false, nil
	}
	return result.ModifiedCount > 0, nil
}

func (s *MongoStore) List(ctx context.Context, limit int) ([]Donation, Totals, error) {
	cursor, err := s.db.Collection(collectionName).Find(ctx, bson.M{},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(int64(limit)))
	if err != nil {
		return nil, Totals{}, ErrUnavailable
	}
	defer func() { _ = cursor.Close(ctx) }()

	donations := make([]Donation, 0, limit)
	for cursor.Next(ctx) {
		var document donationDocument
		if err = cursor.Decode(&document); err != nil {
			return nil, Totals{}, ErrUnavailable
		}
		donations = append(donations, Donation{
			PublicID:  document.PublicID,
			Reference: document.Reference,
			Amount:    document.Amount.String(),
			Currency:  document.Currency,
			DonorName: document.DonorName,
			Message:   document.Message,
			Anonymous: document.Anonymous,
			Status:    document.Status,
			CreatedAt: document.CreatedAt,
			PaidAt:    document.PaidAt,
		})
	}
	if err = cursor.Err(); err != nil {
		return nil, Totals{}, ErrUnavailable
	}
	totals, err := s.paidTotals(ctx)
	if err != nil {
		return nil, Totals{}, err
	}
	return donations, totals, nil
}

func (s *MongoStore) paidTotals(ctx context.Context) (Totals, error) {
	cursor, err := s.db.Collection(collectionName).Aggregate(ctx, []bson.M{
		{"$match": bson.M{"status": "paid"}},
		{"$group": bson.M{
			"_id":      "$currency",
			"count":    bson.M{"$sum": 1},
			"subtotal": bson.M{"$sum": bson.M{"$toDecimal": "$amount"}},
		}},
		{"$sort": bson.M{"count": -1}},
		{"$limit": 1},
	})
	if err != nil {
		return Totals{}, ErrUnavailable
	}
	defer func() { _ = cursor.Close(ctx) }()

	var row struct {
		Currency string          `bson:"_id"`
		Count    int             `bson:"count"`
		Subtotal bson.Decimal128 `bson:"subtotal"`
	}
	if !cursor.Next(ctx) {
		if err = cursor.Err(); err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
			return Totals{}, ErrUnavailable
		}
		return Totals{Total: "0.00"}, nil
	}
	if err = cursor.Decode(&row); err != nil {
		return Totals{}, ErrUnavailable
	}
	return Totals{Currency: row.Currency, Count: row.Count, Total: row.Subtotal.String()}, nil
}
