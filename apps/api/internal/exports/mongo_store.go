package exports

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct {
	database *mongo.Database
	uuid     func() (string, error)
}

func NewMongoStore(database *mongo.Database, uuid func() (string, error)) *MongoStore {
	return &MongoStore{database: database, uuid: uuid}
}

func (store *MongoStore) ListEnquiries(ctx context.Context, limit int) (Result, error) {
	cursor, err := store.database.Collection("crm_enquiries").Find(ctx, bson.M{"deleted_at": bson.M{"$exists": false}}, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(int64(limit)).SetProjection(bson.M{
		"_id": 0, "public_id": 1, "reference": 1, "stage": 1, "source": 1, "enquiry_type": 1, "service_id": 1, "owner_id": 1, "organization_id": 1, "contact_id": 1, "summary": 1, "created_at": 1, "updated_at": 1,
	}))
	if err != nil {
		return Result{}, err
	}
	defer cursor.Close(ctx)
	rows := []Row{}
	for cursor.Next(ctx) {
		var document struct {
			PublicID, Reference, Stage, Source, EnquiryType, ServiceID, OwnerID, OrganizationID, ContactID, Summary string
			CreatedAt, UpdatedAt                                                                                    time.Time
		}
		if err = cursor.Decode(&document); err != nil {
			return Result{}, err
		}
		rows = append(rows, Row{
			safeCell(document.PublicID), safeCell(document.Reference), safeCell(document.Stage), safeCell(document.Source),
			safeCell(document.EnquiryType), safeCell(document.ServiceID), safeCell(document.OwnerID), safeCell(document.OrganizationID),
			safeCell(document.ContactID), safeCell(document.Summary), formatTime(document.CreatedAt), formatTime(document.UpdatedAt),
		})
	}
	return Result{
		Filename: "enquiries.csv",
		Header:   []string{"id", "reference", "stage", "source", "enquiry_type", "service_id", "owner_id", "organization_id", "contact_id", "summary", "created_at", "updated_at"},
		Rows:     rows,
	}, cursor.Err()
}

func (store *MongoStore) ListContacts(ctx context.Context, limit int) (Result, error) {
	cursor, err := store.database.Collection("contacts").Find(ctx, bson.M{"deleted_at": bson.M{"$exists": false}}, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(int64(limit)).SetProjection(bson.M{
		"_id": 0, "public_id": 1, "name": 1, "email": 1, "phone": 1, "role": 1, "organization_id": 1, "country_code": 1, "created_at": 1, "updated_at": 1,
	}))
	if err != nil {
		return Result{}, err
	}
	defer cursor.Close(ctx)
	rows := []Row{}
	for cursor.Next(ctx) {
		var document struct {
			PublicID, Name, Email, Phone, Role, OrganizationID, CountryCode string
			CreatedAt, UpdatedAt                                            time.Time
		}
		if err = cursor.Decode(&document); err != nil {
			return Result{}, err
		}
		rows = append(rows, Row{
			safeCell(document.PublicID), safeCell(document.Name), safeCell(document.Email), safeCell(document.Phone),
			safeCell(document.Role), safeCell(document.OrganizationID), safeCell(document.CountryCode),
			formatTime(document.CreatedAt), formatTime(document.UpdatedAt),
		})
	}
	return Result{
		Filename: "contacts.csv",
		Header:   []string{"id", "name", "email", "phone", "role", "organization_id", "country_code", "created_at", "updated_at"},
		Rows:     rows,
	}, cursor.Err()
}

func (store *MongoStore) ListBookings(ctx context.Context, limit int) (Result, error) {
	cursor, err := store.database.Collection("bookings").Find(ctx, bson.M{"deleted_at": bson.M{"$exists": false}}, options.Find().SetSort(bson.D{{Key: "start_at", Value: -1}}).SetLimit(int64(limit)).SetProjection(bson.M{
		"_id": 0, "public_id": 1, "enquiry_id": 1, "title": 1, "service_id": 1, "venue": 1, "city": 1, "country": 1, "start_at": 1, "end_at": 1, "status": 1, "fee": 1, "currency": 1, "created_at": 1, "updated_at": 1,
	}))
	if err != nil {
		return Result{}, err
	}
	defer cursor.Close(ctx)
	rows := []Row{}
	for cursor.Next(ctx) {
		var document struct {
			PublicID, EnquiryID, Title, ServiceID, Venue, City, Country, Status, Currency string
			Fee                                                                           bson.Decimal128
			StartAt, EndAt, CreatedAt, UpdatedAt                                          time.Time
		}
		if err = cursor.Decode(&document); err != nil {
			return Result{}, err
		}
		rows = append(rows, Row{
			safeCell(document.PublicID), safeCell(document.EnquiryID), safeCell(document.Title), safeCell(document.ServiceID),
			safeCell(document.Venue), safeCell(document.City), safeCell(document.Country), formatTime(document.StartAt),
			formatTime(document.EndAt), safeCell(document.Status), safeCell(document.Fee.String()), safeCell(document.Currency),
			formatTime(document.CreatedAt), formatTime(document.UpdatedAt),
		})
	}
	return Result{
		Filename: "bookings.csv",
		Header:   []string{"id", "enquiry_id", "title", "service_id", "venue", "city", "country", "start_at", "end_at", "status", "fee", "currency", "created_at", "updated_at"},
		Rows:     rows,
	}, cursor.Err()
}

func (store *MongoStore) ListCampaigns(ctx context.Context, limit int) (Result, error) {
	cursor, err := store.database.Collection("campaigns").Find(ctx, bson.M{"deleted_at": bson.M{"$exists": false}}, options.Find().SetSort(bson.D{{Key: "starts_on", Value: -1}}).SetLimit(int64(limit)).SetProjection(bson.M{
		"_id": 0, "public_id": 1, "enquiry_id": 1, "organization_id": 1, "title": 1, "status": 1, "fee": 1, "expenses": 1, "starts_on": 1, "ends_on": 1, "created_at": 1, "updated_at": 1,
	}))
	if err != nil {
		return Result{}, err
	}
	defer cursor.Close(ctx)
	rows := []Row{}
	for cursor.Next(ctx) {
		var document struct {
			PublicID, EnquiryID, OrganizationID, Title, Status, Currency string
			Fee, Expenses                                                bson.Decimal128
			StartsOn, EndsOn, CreatedAt, UpdatedAt                       time.Time
		}
		if err = cursor.Decode(&document); err != nil {
			return Result{}, err
		}
		rows = append(rows, Row{
			safeCell(document.PublicID), safeCell(document.EnquiryID), safeCell(document.OrganizationID), safeCell(document.Title),
			safeCell(document.Status), safeCell(document.Fee.String()), safeCell(document.Currency), safeCell(document.Expenses.String()),
			safeCell(document.Currency), formatTime(document.StartsOn), formatTime(document.EndsOn),
			formatTime(document.CreatedAt), formatTime(document.UpdatedAt),
		})
	}
	return Result{
		Filename: "campaigns.csv",
		Header:   []string{"id", "enquiry_id", "organization_id", "title", "status", "fee_amount", "fee_currency", "expenses_amount", "expenses_currency", "starts_on", "ends_on", "created_at", "updated_at"},
		Rows:     rows,
	}, cursor.Err()
}

func (store *MongoStore) RecordExport(ctx context.Context, actor Actor, resource Resource, rows int, at time.Time) error {
	id, err := store.uuid()
	if err != nil {
		return err
	}
	var actorID any
	if actor.InternalID != "" {
		if objectID, parseErr := bson.ObjectIDFromHex(actor.InternalID); parseErr == nil {
			actorID = objectID
		} else {
			actorID = nil
		}
	}
	_, err = store.database.Collection("audit_logs").InsertOne(ctx, bson.M{
		"public_id":   id,
		"actor_id":    actorID,
		"action":      fmt.Sprintf("export.%s", resource),
		"entity_type": "export",
		"entity_id":   string(resource),
		"metadata":    bson.M{"rows": rows, "actor_public_id": actor.UserID},
		"created_at":  at.UTC(),
	})
	return err
}
