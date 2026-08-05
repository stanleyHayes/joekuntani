package campaigns

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ database *mongo.Database }

func NewMongoStore(database *mongo.Database) *MongoStore { return &MongoStore{database: database} }
func (s *MongoStore) EnquiryExists(ctx context.Context, id string) bool {
	n, err := s.database.Collection("crm_enquiries").CountDocuments(ctx, bson.M{"public_id": id, "deleted_at": bson.M{"$exists": false}})
	return err == nil && n == 1
}
func (s *MongoStore) OrganizationExists(ctx context.Context, id string) bool {
	n, err := s.database.Collection("organizations").CountDocuments(ctx, bson.M{"public_id": id, "deleted_at": bson.M{"$exists": false}})
	return err == nil && n == 1
}
func (s *MongoStore) MediaReady(ctx context.Context, id string) bool {
	n, err := s.database.Collection("media_assets").CountDocuments(ctx, bson.M{"public_id": id, "status": "ready"})
	return err == nil && n == 1
}
func (s *MongoStore) tx(ctx context.Context, fn func(context.Context) error) error {
	session, err := s.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) { return nil, fn(tx) })
	return err
}
func (s *MongoStore) audit(ctx context.Context, actor Actor, action, entityID string) error {
	id, err := bson.ObjectIDFromHex(actor.ID)
	if err != nil {
		return ErrForbidden
	}
	_, err = s.database.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": uuid(), "actor_id": id, "action": action, "entity_type": "campaign", "entity_id": entityID, "metadata": bson.M{}, "created_at": time.Now().UTC()})
	return err
}
func mongoError(err error) error {
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	if mongo.IsDuplicateKeyError(err) {
		return ErrConflict
	}
	return err
}
func (s *MongoStore) Create(ctx context.Context, item Campaign, actor Actor) error {
	return s.tx(ctx, func(tx context.Context) error {
		_, err := s.database.Collection("campaigns").InsertOne(tx, campaignDoc(item))
		if err != nil {
			return mongoError(err)
		}
		if err = s.replaceAssetReferences(tx, "campaign", item.PublicID, nil, item.AssetIDs, item.CreatedAt); err != nil {
			return err
		}
		return s.audit(tx, actor, "campaign.created", item.PublicID)
	})
}
func (s *MongoStore) Update(ctx context.Context, item Campaign, actor Actor) error {
	return s.tx(ctx, func(tx context.Context) error {
		var previous campaignDocument
		if err := s.database.Collection("campaigns").FindOne(tx, bson.M{"public_id": item.PublicID, "deleted_at": bson.M{"$exists": false}}).Decode(&previous); err != nil {
			return mongoError(err)
		}
		r, err := s.database.Collection("campaigns").ReplaceOne(tx, bson.M{"public_id": item.PublicID, "deleted_at": bson.M{"$exists": false}}, campaignDoc(item))
		if err != nil {
			return mongoError(err)
		}
		if r.MatchedCount != 1 {
			return ErrNotFound
		}
		if err = s.replaceAssetReferences(tx, "campaign", item.PublicID, previous.AssetIDs, item.AssetIDs, item.UpdatedAt); err != nil {
			return err
		}
		return s.audit(tx, actor, "campaign.updated", item.PublicID)
	})
}
func (s *MongoStore) Find(ctx context.Context, id string) (Campaign, error) {
	var item campaignDocument
	err := s.database.Collection("campaigns").FindOne(ctx, bson.M{"public_id": id, "deleted_at": bson.M{"$exists": false}}).Decode(&item)
	return item.model(), mongoError(err)
}
func (s *MongoStore) List(ctx context.Context, f Filter) ([]Campaign, error) {
	q := bson.M{}
	if !f.IncludeDeleted {
		q["deleted_at"] = bson.M{"$exists": false}
	}
	if f.Status != "" {
		q["status"] = f.Status
	}
	if f.OrganizationID != "" {
		q["organization_id"] = f.OrganizationID
	}
	if f.Platform != "" {
		q["platforms"] = f.Platform
	}
	cursor, err := s.database.Collection("campaigns").Find(ctx, q, options.Find().SetSort(bson.D{{Key: "starts_on", Value: -1}, {Key: "public_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var docs []campaignDocument
	if err = cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	items := make([]Campaign, len(docs))
	for i := range docs {
		items[i] = docs[i].model()
	}
	return items, nil
}
func (s *MongoStore) SoftDelete(ctx context.Context, id string, at time.Time, actor Actor) error {
	return s.tx(ctx, func(tx context.Context) error {
		var current campaignDocument
		if err := s.database.Collection("campaigns").FindOne(tx, bson.M{"public_id": id, "deleted_at": bson.M{"$exists": false}}).Decode(&current); err != nil {
			return mongoError(err)
		}
		r, err := s.database.Collection("campaigns").UpdateOne(tx, bson.M{"public_id": id, "deleted_at": bson.M{"$exists": false}}, bson.M{"$set": bson.M{"deleted_at": at, "updated_at": at}})
		if err != nil {
			return mongoError(err)
		}
		if r.MatchedCount != 1 {
			return ErrNotFound
		}
		if err = s.replaceAssetReferences(tx, "campaign", id, current.AssetIDs, nil, at); err != nil {
			return err
		}
		cursor, err := s.database.Collection("campaign_deliverables").Find(tx, bson.M{"campaign_id": id})
		if err != nil {
			return err
		}
		var deliverables []Deliverable
		if err = cursor.All(tx, &deliverables); err != nil {
			return err
		}
		for _, deliverable := range deliverables {
			if err = s.replaceAssetReferences(tx, "campaign_deliverable", deliverable.PublicID, deliverable.AssetIDs, nil, at); err != nil {
				return err
			}
		}
		return s.audit(tx, actor, "campaign.deleted", id)
	})
}
func (s *MongoStore) CreateDeliverable(ctx context.Context, item Deliverable, actor Actor) error {
	return s.tx(ctx, func(tx context.Context) error {
		_, err := s.database.Collection("campaign_deliverables").InsertOne(tx, item)
		if err != nil {
			return mongoError(err)
		}
		if err = s.replaceAssetReferences(tx, "campaign_deliverable", item.PublicID, nil, item.AssetIDs, item.CreatedAt); err != nil {
			return err
		}
		return s.audit(tx, actor, "campaign.deliverable_created", item.PublicID)
	})
}
func (s *MongoStore) UpdateDeliverable(ctx context.Context, item Deliverable, actor Actor) error {
	return s.tx(ctx, func(tx context.Context) error {
		var previous Deliverable
		if err := s.database.Collection("campaign_deliverables").FindOne(tx, bson.M{"public_id": item.PublicID, "campaign_id": item.CampaignID}).Decode(&previous); err != nil {
			return mongoError(err)
		}
		r, err := s.database.Collection("campaign_deliverables").ReplaceOne(tx, bson.M{"public_id": item.PublicID, "campaign_id": item.CampaignID}, item)
		if err != nil {
			return mongoError(err)
		}
		if r.MatchedCount != 1 {
			return ErrNotFound
		}
		if err = s.replaceAssetReferences(tx, "campaign_deliverable", item.PublicID, previous.AssetIDs, item.AssetIDs, item.UpdatedAt); err != nil {
			return err
		}
		return s.audit(tx, actor, "campaign.deliverable_updated", item.PublicID)
	})
}

func (s *MongoStore) replaceAssetReferences(ctx context.Context, entityType, entityID string, previous, next []string, at time.Time) error {
	old := make(map[string]bool, len(previous))
	newValues := make(map[string]bool, len(next))
	for _, id := range previous {
		old[id] = true
	}
	for _, id := range next {
		newValues[id] = true
		if old[id] {
			continue
		}
		result, err := s.database.Collection("media_assets").UpdateOne(ctx, bson.M{"public_id": id, "status": "ready"}, bson.M{"$inc": bson.M{"reference_version": 1}})
		if err != nil {
			return err
		}
		if result.MatchedCount != 1 {
			return ErrConflict
		}
		_, err = s.database.Collection("media_usage_references").InsertOne(ctx, bson.M{"asset_id": id, "entity_type": entityType, "entity_id": entityID, "field": "assets", "created_at": at})
		if err != nil && !mongo.IsDuplicateKeyError(err) {
			return err
		}
	}
	for _, id := range previous {
		if newValues[id] {
			continue
		}
		result, err := s.database.Collection("media_assets").UpdateOne(ctx, bson.M{"public_id": id, "status": bson.M{"$ne": "deleted"}}, bson.M{"$inc": bson.M{"reference_version": 1}})
		if err != nil {
			return err
		}
		if result.MatchedCount != 1 {
			return ErrConflict
		}
		if _, err = s.database.Collection("media_usage_references").DeleteOne(ctx, bson.M{"asset_id": id, "entity_type": entityType, "entity_id": entityID, "field": "assets"}); err != nil {
			return err
		}
	}
	return nil
}
func (s *MongoStore) FindDeliverable(ctx context.Context, campaignID, id string) (Deliverable, error) {
	var item Deliverable
	err := s.database.Collection("campaign_deliverables").FindOne(ctx, bson.M{"public_id": id, "campaign_id": campaignID}).Decode(&item)
	return item, mongoError(err)
}
func (s *MongoStore) ListDeliverables(ctx context.Context, campaignID string) ([]Deliverable, error) {
	cursor, err := s.database.Collection("campaign_deliverables").Find(ctx, bson.M{"campaign_id": campaignID}, options.Find().SetSort(bson.D{{Key: "due_at", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var items []Deliverable
	err = cursor.All(ctx, &items)
	return items, err
}
func campaignDoc(v Campaign) bson.M {
	fee, _ := bson.ParseDecimal128(v.Fee.Amount)
	expenses, _ := bson.ParseDecimal128(v.Expenses.Amount)
	doc := bson.M{"public_id": v.PublicID, "enquiry_id": v.EnquiryID, "organization_id": v.OrganizationID, "title": v.Title, "objective": v.Objective, "platforms": v.Platforms, "starts_on": v.StartsOn, "ends_on": v.EndsOn, "status": v.Status, "fee": fee, "expenses": expenses, "currency": v.Fee.Currency, "results": v.Results, "asset_ids": v.AssetIDs, "created_at": v.CreatedAt, "updated_at": v.UpdatedAt}
	if v.DeletedAt != nil {
		doc["deleted_at"] = v.DeletedAt
	}
	return doc
}

type campaignDocument struct {
	PublicID       string          `bson:"public_id"`
	EnquiryID      string          `bson:"enquiry_id"`
	OrganizationID string          `bson:"organization_id"`
	Title          string          `bson:"title"`
	Objective      string          `bson:"objective"`
	Platforms      []string        `bson:"platforms"`
	StartsOn       time.Time       `bson:"starts_on"`
	EndsOn         time.Time       `bson:"ends_on"`
	Status         Status          `bson:"status"`
	Fee            bson.Decimal128 `bson:"fee"`
	Expenses       bson.Decimal128 `bson:"expenses"`
	Currency       string          `bson:"currency"`
	Results        []Result        `bson:"results"`
	AssetIDs       []string        `bson:"asset_ids"`
	DeletedAt      *time.Time      `bson:"deleted_at,omitempty"`
	CreatedAt      time.Time       `bson:"created_at"`
	UpdatedAt      time.Time       `bson:"updated_at"`
}

func (d campaignDocument) model() Campaign {
	return Campaign{PublicID: d.PublicID, EnquiryID: d.EnquiryID, OrganizationID: d.OrganizationID, Title: d.Title, Objective: d.Objective, Platforms: d.Platforms, StartsOn: d.StartsOn, EndsOn: d.EndsOn, Status: d.Status, Fee: Money{Amount: d.Fee.String(), Currency: d.Currency}, Expenses: Money{Amount: d.Expenses.String(), Currency: d.Currency}, Results: d.Results, AssetIDs: d.AssetIDs, DeletedAt: d.DeletedAt, CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt}
}
