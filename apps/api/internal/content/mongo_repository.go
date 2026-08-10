package content

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoRepository struct{ database *mongo.Database }

func NewMongoRepository(database *mongo.Database) *MongoRepository {
	return &MongoRepository{database: database}
}

var collections = map[Kind]string{Page: "pages", Portfolio: "portfolio_items", Video: "videos", Press: "press_items", Testimonial: "testimonials"}

type document struct {
	ID              bson.ObjectID  `bson:"_id"`
	PublicID        string         `bson:"public_id"`
	Slug            string         `bson:"slug,omitempty"`
	Title           string         `bson:"title"`
	Summary         string         `bson:"summary,omitempty"`
	Body            string         `bson:"body,omitempty"`
	Category        string         `bson:"category,omitempty"`
	Tags            []string       `bson:"tags"`
	Featured        bool           `bson:"featured"`
	GalleryAssetIDs []string       `bson:"gallery_asset_ids"`
	Results         []Result       `bson:"results"`
	Sections        []Section      `bson:"sections"`
	ExternalURL     string         `bson:"external_url,omitempty"`
	EmbedURL        string         `bson:"embed_url,omitempty"`
	VideoAssetID    string         `bson:"video_asset_id,omitempty"`
	Outlet          string         `bson:"outlet,omitempty"`
	PersonName      string         `bson:"person_name,omitempty"`
	PersonTitle     string         `bson:"person_title,omitempty"`
	Organization    string         `bson:"organization,omitempty"`
	SEO             SEO            `bson:"seo"`
	Status          Status         `bson:"status"`
	Approved        bool           `bson:"approved"`
	Revision        int64          `bson:"revision"`
	PublishAt       *bson.DateTime `bson:"publish_at,omitempty"`
	UnpublishAt     *bson.DateTime `bson:"unpublish_at,omitempty"`
	PublishedAt     *bson.DateTime `bson:"published_at,omitempty"`
	CreatedAt       bson.DateTime  `bson:"created_at"`
	UpdatedAt       bson.DateTime  `bson:"updated_at"`
}

func fromDocument(kind Kind, d document) Item {
	return Item{ID: d.ID.Hex(), PublicID: d.PublicID, Kind: kind, Slug: d.Slug, Title: d.Title, Summary: d.Summary, Body: d.Body, Category: d.Category, Tags: emptyIfNil(d.Tags), Featured: d.Featured, GalleryAssetIDs: emptyIfNil(d.GalleryAssetIDs), Results: emptyIfNil(d.Results), Sections: emptyIfNil(d.Sections), ExternalURL: d.ExternalURL, EmbedURL: d.EmbedURL, VideoAssetID: d.VideoAssetID, Outlet: d.Outlet, PersonName: d.PersonName, PersonTitle: d.PersonTitle, Organization: d.Organization, SEO: d.SEO, Status: d.Status, Approved: d.Approved, Revision: d.Revision, PublishAt: fromDate(d.PublishAt), UnpublishAt: fromDate(d.UnpublishAt), PublishedAt: fromDate(d.PublishedAt), CreatedAt: d.CreatedAt.Time(), UpdatedAt: d.UpdatedAt.Time()}
}

// emptyIfNil keeps absent collections serialising as [] rather than null.
//
// Not cosmetic: several collections (pages among them) have validators that
// forbid the `results` property entirely, so it is always absent on read. The
// public site rejects any item whose collections are not arrays, which meant no
// page could ever be published from the CMS.
func emptyIfNil[T any](values []T) []T {
	if values == nil {
		return []T{}
	}
	return values
}
func fromDate(value *bson.DateTime) *time.Time {
	if value == nil {
		return nil
	}
	result := value.Time()
	return &result
}
func (repository *MongoRepository) List(ctx context.Context, query Query) ([]Item, error) {
	name, ok := collections[query.Kind]
	if !ok {
		return nil, ErrInvalid
	}
	filter := bson.M{}
	if query.Category != "" {
		filter["category"] = query.Category
	}
	if query.Tag != "" {
		filter["tags"] = query.Tag
	}
	if query.FeaturedOnly {
		filter["featured"] = true
	}
	if query.PublicOnly {
		filter["approved"] = true
		filter["status"] = bson.M{"$in": bson.A{Published, Scheduled}}
		filter["publish_at"] = bson.M{"$lte": query.Now}
		filter["$or"] = bson.A{bson.M{"unpublish_at": bson.M{"$exists": false}}, bson.M{"unpublish_at": nil}, bson.M{"unpublish_at": bson.M{"$gt": query.Now}}}
	}
	cursor, err := repository.database.Collection(name).Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "featured", Value: -1}, {Key: "publish_at", Value: -1}, {Key: "created_at", Value: -1}, {Key: "_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	items := []Item{}
	for cursor.Next(ctx) {
		var d document
		if err = cursor.Decode(&d); err != nil {
			return nil, err
		}
		items = append(items, fromDocument(query.Kind, d))
	}
	return items, cursor.Err()
}
func (repository *MongoRepository) FindByID(ctx context.Context, id string) (Item, error) {
	for kind, name := range collections {
		var d document
		err := repository.database.Collection(name).FindOne(ctx, bson.M{"public_id": id}).Decode(&d)
		if err == nil {
			return fromDocument(kind, d), nil
		}
		if !errors.Is(err, mongo.ErrNoDocuments) {
			return Item{}, err
		}
	}
	return Item{}, ErrNotFound
}
func (repository *MongoRepository) FindBySlug(ctx context.Context, kind Kind, slug string) (Item, error) {
	name, ok := collections[kind]
	if !ok {
		return Item{}, ErrNotFound
	}
	var d document
	if err := repository.database.Collection(name).FindOne(ctx, bson.M{"slug": slug}).Decode(&d); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return Item{}, ErrNotFound
		}
		return Item{}, err
	}
	return fromDocument(kind, d), nil
}
func (repository *MongoRepository) Create(ctx context.Context, item Item, audit AuditEvent) error {
	return repository.transaction(ctx, func(tx context.Context) error {
		_, err := repository.database.Collection(collections[item.Kind]).InsertOne(tx, toBSON(item, true))
		if err != nil {
			return mongoError(err)
		}
		return repository.audit(tx, item.Kind, audit)
	})
}
func (repository *MongoRepository) Update(ctx context.Context, item Item, audit AuditEvent) error {
	return repository.transaction(ctx, func(tx context.Context) error {
		filter := bson.M{"public_id": item.PublicID, "revision": item.Revision - 1}
		if item.Slug != "" {
			filter["slug"] = item.Slug
		}
		result, err := repository.database.Collection(collections[item.Kind]).UpdateOne(tx, filter, bson.M{"$set": toBSON(item, false)})
		if err != nil {
			return mongoError(err)
		}
		if result.MatchedCount != 1 {
			return ErrConflict
		}
		return repository.audit(tx, item.Kind, audit)
	})
}
func (repository *MongoRepository) Delete(ctx context.Context, item Item, audit AuditEvent) error {
	return repository.transaction(ctx, func(tx context.Context) error {
		result, err := repository.database.Collection(collections[item.Kind]).DeleteOne(tx, bson.M{"public_id": item.PublicID, "revision": item.Revision})
		if err != nil {
			return err
		}
		if result.DeletedCount != 1 {
			return ErrConflict
		}
		return repository.audit(tx, item.Kind, audit)
	})
}
func (repository *MongoRepository) transaction(ctx context.Context, action func(context.Context) error) error {
	session, err := repository.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) { return nil, action(tx) })
	return err
}
func (repository *MongoRepository) audit(ctx context.Context, kind Kind, event AuditEvent) error {
	actor, err := bson.ObjectIDFromHex(event.ActorID)
	if err != nil {
		return ErrForbidden
	}
	_, err = repository.database.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": event.PublicID, "actor_id": actor, "action": event.Action, "entity_type": string(kind), "entity_id": event.EntityID, "metadata": bson.M{}, "created_at": event.CreatedAt})
	return err
}
func toBSON(item Item, identity bool) bson.M {
	d := bson.M{"title": item.Title, "summary": item.Summary, "tags": item.Tags, "featured": item.Featured, "gallery_asset_ids": item.GalleryAssetIDs, "seo": item.SEO, "status": item.Status, "approved": item.Approved, "revision": item.Revision, "publish_at": item.PublishAt, "unpublish_at": item.UnpublishAt, "published_at": item.PublishedAt, "updated_at": item.UpdatedAt}
	// Every kind, not one: blocks are a property of an editorial record, and
	// nesting this in a single case silently dropped them on every other kind.
	d["sections"] = emptyIfNil(item.Sections)
	switch item.Kind {
	case Page:
		d["body"] = item.Body
	case Portfolio:
		d["body"], d["category"], d["results"] = item.Body, item.Category, item.Results
	case Video:
		d["body"], d["category"], d["external_url"], d["embed_url"], d["video_asset_id"] = item.Body, item.Category, item.ExternalURL, item.EmbedURL, item.VideoAssetID
	case Press:
		d["body"], d["category"], d["external_url"], d["video_asset_id"], d["outlet"] = item.Body, item.Category, item.ExternalURL, item.VideoAssetID, item.Outlet
	case Testimonial:
		d["body"], d["person_name"], d["person_title"], d["organization"] = item.Body, item.PersonName, item.PersonTitle, item.Organization
	}
	if identity {
		d["public_id"] = item.PublicID
		if item.Slug != "" {
			d["slug"] = item.Slug
		}
		d["created_at"] = item.CreatedAt
	}
	return d
}
func mongoError(err error) error {
	if mongo.IsDuplicateKeyError(err) {
		return ErrConflict
	}
	return err
}
