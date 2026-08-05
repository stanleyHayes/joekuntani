package events

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

type eventDocument struct {
	ID                      bson.ObjectID `bson:"_id"`
	Event                   `bson:",inline"`
	TicketCapacityAllocated int `bson:"ticket_capacity_allocated"`
}

type ticketDocument struct {
	ID          bson.ObjectID   `bson:"_id"`
	PublicID    string          `bson:"public_id"`
	EventID     string          `bson:"event_id"`
	Name        string          `bson:"name"`
	Description string          `bson:"description"`
	Price       bson.Decimal128 `bson:"price"`
	Currency    string          `bson:"currency"`
	Capacity    int             `bson:"capacity"`
	Sold        int             `bson:"sold"`
	Reserved    int             `bson:"reserved"`
	MinPerOrder int             `bson:"min_per_order"`
	MaxPerOrder int             `bson:"max_per_order"`
	SalesStart  time.Time       `bson:"sales_start"`
	SalesEnd    time.Time       `bson:"sales_end"`
	Paused      bool            `bson:"paused"`
	Status      TicketStatus    `bson:"status"`
	SortOrder   int             `bson:"sort_order"`
	CreatedAt   time.Time       `bson:"created_at"`
	UpdatedAt   time.Time       `bson:"updated_at"`
}

func (store *MongoStore) List(ctx context.Context) ([]Event, error) {
	cursor, err := store.database.Collection("events").Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "starts_at", Value: 1}, {Key: "public_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var documents []eventDocument
	if err = cursor.All(ctx, &documents); err != nil {
		return nil, err
	}
	result := make([]Event, len(documents))
	for index := range documents {
		result[index] = documents[index].Event
		result[index].ID = documents[index].ID.Hex()
	}
	return result, nil
}

func (store *MongoStore) FindEvent(ctx context.Context, id string) (Event, error) {
	return store.findEvent(ctx, bson.M{"public_id": id})
}

func (store *MongoStore) FindBySlug(ctx context.Context, slug string) (Event, error) {
	return store.findEvent(ctx, bson.M{"slug": slug})
}

func (store *MongoStore) findEvent(ctx context.Context, filter bson.M) (Event, error) {
	var document eventDocument
	if err := store.database.Collection("events").FindOne(ctx, filter).Decode(&document); err != nil {
		return Event{}, mapNotFound(err)
	}
	document.Event.ID = document.ID.Hex()
	return document.Event, nil
}

func (store *MongoStore) CreateEvent(ctx context.Context, event Event, audit AuditEvent) error {
	id := bson.NewObjectID()
	document := event
	document.ID = ""
	return store.transaction(ctx, func(tx context.Context) error {
		_, err := store.database.Collection("events").InsertOne(tx, bson.M{"_id": id, "public_id": document.PublicID, "slug": document.Slug, "title": document.Title, "summary": document.Summary, "description": document.Description, "venue": document.Venue, "policies": document.Policies, "starts_at": document.StartsAt, "ends_at": document.EndsAt, "timezone": document.Timezone, "capacity": document.Capacity, "ticket_capacity_allocated": 0, "banner_asset_id": document.BannerAssetID, "banner": document.Banner, "status": document.Status, "created_at": document.CreatedAt, "updated_at": document.UpdatedAt})
		if err != nil {
			return mapWrite(err)
		}
		return store.audit(tx, audit)
	})
}

func (store *MongoStore) UpdateEvent(ctx context.Context, event Event, audit AuditEvent) error {
	return store.transaction(ctx, func(tx context.Context) error {
		filter := bson.M{"public_id": event.PublicID, "status": bson.M{"$ne": EventCancelled}, "ticket_capacity_allocated": bson.M{"$lte": event.Capacity}}
		set := bson.M{"title": event.Title, "summary": event.Summary, "description": event.Description, "venue": event.Venue, "policies": event.Policies, "starts_at": event.StartsAt, "ends_at": event.EndsAt, "timezone": event.Timezone, "capacity": event.Capacity, "banner_asset_id": event.BannerAssetID, "banner": event.Banner, "updated_at": event.UpdatedAt}
		result, err := store.database.Collection("events").UpdateOne(tx, filter, bson.M{"$set": set})
		if err != nil {
			return mapWrite(err)
		}
		if result.MatchedCount != 1 {
			return ErrConflict
		}
		return store.audit(tx, audit)
	})
}

func (store *MongoStore) TransitionEvent(ctx context.Context, id string, from, to EventStatus, at time.Time, audit AuditEvent) (Event, error) {
	var result Event
	err := store.transaction(ctx, func(tx context.Context) error {
		set := bson.M{"status": to, "updated_at": at}
		if to == EventPublished {
			set["published_at"] = at
		}
		if to == EventCancelled {
			set["cancelled_at"] = at
		}
		var document eventDocument
		err := store.database.Collection("events").FindOneAndUpdate(tx, bson.M{"public_id": id, "status": from}, bson.M{"$set": set}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&document)
		if err != nil {
			return mapConflict(err)
		}
		if err = store.audit(tx, audit); err != nil {
			return err
		}
		result = document.Event
		result.ID = document.ID.Hex()
		return nil
	})
	return result, err
}

func (store *MongoStore) ListTickets(ctx context.Context, eventID string) ([]TicketType, error) {
	cursor, err := store.database.Collection("ticket_types").Find(ctx, bson.M{"event_id": eventID}, options.Find().SetSort(bson.D{{Key: "sort_order", Value: 1}, {Key: "public_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var documents []ticketDocument
	if err = cursor.All(ctx, &documents); err != nil {
		return nil, err
	}
	result := make([]TicketType, len(documents))
	for index, document := range documents {
		result[index] = ticketFromDocument(document)
	}
	return result, nil
}

func (store *MongoStore) FindTicket(ctx context.Context, eventID, ticketID string) (TicketType, error) {
	var document ticketDocument
	if err := store.database.Collection("ticket_types").FindOne(ctx, bson.M{"event_id": eventID, "public_id": ticketID}).Decode(&document); err != nil {
		return TicketType{}, mapNotFound(err)
	}
	return ticketFromDocument(document), nil
}

func (store *MongoStore) CreateTicket(ctx context.Context, ticket TicketType, audit AuditEvent) error {
	price, err := bson.ParseDecimal128(ticket.Price)
	if err != nil {
		return ErrInvalid
	}
	return store.transaction(ctx, func(tx context.Context) error {
		filter := bson.M{"public_id": ticket.EventID, "status": EventDraft, "$expr": bson.M{"$lte": bson.A{bson.M{"$add": bson.A{"$ticket_capacity_allocated", ticket.Capacity}}, "$capacity"}}}
		claim, err := store.database.Collection("events").UpdateOne(tx, filter, bson.M{"$inc": bson.M{"ticket_capacity_allocated": ticket.Capacity}})
		if err != nil || claim.MatchedCount != 1 {
			return ErrConflict
		}
		document := ticketDocument{ID: bson.NewObjectID(), PublicID: ticket.PublicID, EventID: ticket.EventID, Name: ticket.Name, Description: ticket.Description, Price: price, Currency: ticket.Currency, Capacity: ticket.Capacity, Sold: ticket.Sold, Reserved: ticket.Reserved, MinPerOrder: ticket.MinPerOrder, MaxPerOrder: ticket.MaxPerOrder, SalesStart: ticket.SalesStart, SalesEnd: ticket.SalesEnd, Paused: ticket.Paused, Status: ticket.Status, SortOrder: ticket.SortOrder, CreatedAt: ticket.CreatedAt, UpdatedAt: ticket.UpdatedAt}
		if _, err = store.database.Collection("ticket_types").InsertOne(tx, document); err != nil {
			return mapWrite(err)
		}
		return store.audit(tx, audit)
	})
}

func (store *MongoStore) UpdateTicket(ctx context.Context, ticket TicketType, audit AuditEvent) error {
	price, err := bson.ParseDecimal128(ticket.Price)
	if err != nil {
		return ErrInvalid
	}
	return store.transaction(ctx, func(tx context.Context) error {
		var current ticketDocument
		if err := store.database.Collection("ticket_types").FindOne(tx, bson.M{"event_id": ticket.EventID, "public_id": ticket.PublicID}).Decode(&current); err != nil {
			return mapNotFound(err)
		}
		delta := ticket.Capacity - current.Capacity
		filter := bson.M{"public_id": ticket.EventID}
		if delta > 0 {
			filter["$expr"] = bson.M{"$lte": bson.A{bson.M{"$add": bson.A{"$ticket_capacity_allocated", delta}}, "$capacity"}}
		}
		claim, err := store.database.Collection("events").UpdateOne(tx, filter, bson.M{"$inc": bson.M{"ticket_capacity_allocated": delta}})
		if err != nil || claim.MatchedCount != 1 {
			return ErrConflict
		}
		set := bson.M{"name": ticket.Name, "description": ticket.Description, "price": price, "currency": ticket.Currency, "capacity": ticket.Capacity, "min_per_order": ticket.MinPerOrder, "max_per_order": ticket.MaxPerOrder, "sales_start": ticket.SalesStart, "sales_end": ticket.SalesEnd, "status": ticket.Status, "sort_order": ticket.SortOrder, "updated_at": ticket.UpdatedAt}
		updated, err := store.database.Collection("ticket_types").UpdateOne(tx, bson.M{"event_id": ticket.EventID, "public_id": ticket.PublicID, "$expr": bson.M{"$lte": bson.A{bson.M{"$add": bson.A{"$sold", "$reserved"}}, ticket.Capacity}}}, bson.M{"$set": set})
		if err != nil || updated.MatchedCount != 1 {
			return ErrConflict
		}
		return store.audit(tx, audit)
	})
}

func (store *MongoStore) SetTicketPaused(ctx context.Context, eventID, ticketID string, paused bool, at time.Time, audit AuditEvent) (TicketType, error) {
	var result TicketType
	err := store.transaction(ctx, func(tx context.Context) error {
		var document ticketDocument
		err := store.database.Collection("ticket_types").FindOneAndUpdate(tx, bson.M{"event_id": eventID, "public_id": ticketID}, bson.M{"$set": bson.M{"paused": paused, "status": map[bool]TicketStatus{true: TicketPaused, false: TicketOnSale}[paused], "updated_at": at}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&document)
		if err != nil {
			return mapNotFound(err)
		}
		if err = store.audit(tx, audit); err != nil {
			return err
		}
		result = ticketFromDocument(document)
		result.Status = TicketState(result, at)
		return nil
	})
	return result, err
}

func (store *MongoStore) transaction(ctx context.Context, work func(context.Context) error) error {
	session, err := store.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) { return nil, work(tx) })
	return err
}

func (store *MongoStore) audit(ctx context.Context, event AuditEvent) error {
	actor, err := bson.ObjectIDFromHex(event.ActorID)
	if err != nil {
		return ErrForbidden
	}
	_, err = store.database.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": event.PublicID, "actor_id": actor, "action": event.Action, "entity_type": event.EntityType, "entity_id": event.EntityID, "metadata": bson.M{}, "created_at": event.CreatedAt})
	return err
}

func ticketFromDocument(document ticketDocument) TicketType {
	return TicketType{ID: document.ID.Hex(), PublicID: document.PublicID, EventID: document.EventID, Name: document.Name, Description: document.Description, Price: document.Price.String(), Currency: document.Currency, Capacity: document.Capacity, Sold: document.Sold, Reserved: document.Reserved, MinPerOrder: document.MinPerOrder, MaxPerOrder: document.MaxPerOrder, SalesStart: document.SalesStart, SalesEnd: document.SalesEnd, Paused: document.Paused, Status: document.Status, SortOrder: document.SortOrder, CreatedAt: document.CreatedAt, UpdatedAt: document.UpdatedAt}
}

func mapNotFound(err error) error {
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	return err
}

func mapConflict(err error) error {
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrConflict
	}
	return mapWrite(err)
}

func mapWrite(err error) error {
	if mongo.IsDuplicateKeyError(err) {
		return ErrConflict
	}
	return err
}

var _ Store = (*MongoStore)(nil)
