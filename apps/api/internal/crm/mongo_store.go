package crm

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoStore struct{ database *mongo.Database }

func NewMongoStore(database *mongo.Database) *MongoStore { return &MongoStore{database: database} }

func (s *MongoStore) transaction(ctx context.Context, work func(context.Context) error) error {
	session, err := s.database.Client().StartSession()
	if err != nil {
		return err
	}
	defer session.EndSession(ctx)
	_, err = session.WithTransaction(ctx, func(tx context.Context) (any, error) { return nil, work(tx) })
	return err
}
func (s *MongoStore) audit(ctx context.Context, event AuditEvent) error {
	actor, err := bson.ObjectIDFromHex(event.ActorID)
	if err != nil {
		return ErrForbidden
	}
	_, err = s.database.Collection("audit_logs").InsertOne(ctx, bson.M{"public_id": event.PublicID, "actor_id": actor, "action": event.Action, "entity_type": event.EntityType, "entity_id": event.EntityID, "metadata": bson.M{}, "created_at": event.CreatedAt})
	return err
}
func mapMongo(err error) error {
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	if mongo.IsDuplicateKeyError(err) {
		return ErrConflict
	}
	return err
}

func (s *MongoStore) CreateOrganization(ctx context.Context, v Organization, a AuditEvent) error {
	return s.transaction(ctx, func(tx context.Context) error {
		_, err := s.database.Collection("organizations").InsertOne(tx, bson.M{"public_id": v.PublicID, "name": v.Name, "normalized_name": v.NormalizedName, "website": v.Website, "country_code": v.CountryCode, "created_at": v.CreatedAt, "updated_at": v.UpdatedAt})
		if err != nil {
			return mapMongo(err)
		}
		return s.audit(tx, a)
	})
}
func (s *MongoStore) FindOrganizationByNormalizedName(ctx context.Context, name string) (Organization, error) {
	var item Organization
	err := s.database.Collection("organizations").FindOne(ctx, bson.M{"normalized_name": name, "deleted_at": bson.M{"$exists": false}}).Decode(&item)
	if err != nil {
		return Organization{}, mapMongo(err)
	}
	return item, nil
}
func (s *MongoStore) SoftDeleteOrganization(ctx context.Context, id string, at time.Time, a AuditEvent) error {
	return s.transaction(ctx, func(tx context.Context) error {
		refs, err := s.database.Collection("contacts").CountDocuments(tx, bson.M{"organization_id": id, "deleted_at": bson.M{"$exists": false}})
		if err != nil {
			return err
		}
		if refs > 0 {
			return ErrConflict
		}
		r, err := s.database.Collection("organizations").UpdateOne(tx, bson.M{"public_id": id, "deleted_at": bson.M{"$exists": false}}, bson.M{"$set": bson.M{"deleted_at": at, "updated_at": at}})
		if err != nil {
			return mapMongo(err)
		}
		if r.MatchedCount != 1 {
			return ErrNotFound
		}
		return s.audit(tx, a)
	})
}
func (s *MongoStore) CreateContact(ctx context.Context, v Contact, a AuditEvent) error {
	return s.transaction(ctx, func(tx context.Context) error {
		if v.OrganizationID != "" {
			n, err := s.database.Collection("organizations").CountDocuments(tx, bson.M{"public_id": v.OrganizationID, "deleted_at": bson.M{"$exists": false}})
			if err != nil {
				return err
			}
			if n != 1 {
				return ErrNotFound
			}
		}
		_, err := s.database.Collection("contacts").InsertOne(tx, bson.M{"public_id": v.PublicID, "organization_id": v.OrganizationID, "name": v.Name, "email": v.Email, "phone": v.Phone, "role": v.Role, "country_code": v.CountryCode, "normalized_email": v.NormalizedEmail, "normalized_phone": v.NormalizedPhone, "created_at": v.CreatedAt, "updated_at": v.UpdatedAt})
		if err != nil {
			return mapMongo(err)
		}
		return s.audit(tx, a)
	})
}
func (s *MongoStore) SoftDeleteContact(ctx context.Context, id string, at time.Time, a AuditEvent) error {
	return s.transaction(ctx, func(tx context.Context) error {
		refs, err := s.database.Collection("crm_enquiries").CountDocuments(tx, bson.M{"contact_id": id, "deleted_at": bson.M{"$exists": false}})
		if err != nil {
			return err
		}
		if refs > 0 {
			return ErrConflict
		}
		r, err := s.database.Collection("contacts").UpdateOne(tx, bson.M{"public_id": id, "deleted_at": bson.M{"$exists": false}}, bson.M{"$set": bson.M{"deleted_at": at, "updated_at": at}})
		if err != nil {
			return mapMongo(err)
		}
		if r.MatchedCount != 1 {
			return ErrNotFound
		}
		return s.audit(tx, a)
	})
}
func (s *MongoStore) FindContact(ctx context.Context, id string) (Contact, error) {
	return s.findContact(ctx, bson.M{"public_id": id, "deleted_at": bson.M{"$exists": false}})
}
func (s *MongoStore) FindContactByLookup(ctx context.Context, email, phone string) (Contact, error) {
	or := bson.A{}
	if email != "" {
		or = append(or, bson.M{"normalized_email": email})
	}
	if phone != "" {
		or = append(or, bson.M{"normalized_phone": phone})
	}
	if len(or) == 0 {
		return Contact{}, ErrNotFound
	}
	return s.findContact(ctx, bson.M{"$or": or, "deleted_at": bson.M{"$exists": false}})
}

type contactDoc struct {
	PublicID        string     `bson:"public_id"`
	OrganizationID  string     `bson:"organization_id"`
	Name            string     `bson:"name"`
	Email           string     `bson:"email"`
	Phone           string     `bson:"phone"`
	Role            string     `bson:"role"`
	CountryCode     string     `bson:"country_code"`
	NormalizedEmail string     `bson:"normalized_email"`
	NormalizedPhone string     `bson:"normalized_phone"`
	CreatedAt       time.Time  `bson:"created_at"`
	UpdatedAt       time.Time  `bson:"updated_at"`
	DeletedAt       *time.Time `bson:"deleted_at,omitempty"`
}

func (s *MongoStore) findContact(ctx context.Context, filter bson.M) (Contact, error) {
	var d contactDoc
	err := s.database.Collection("contacts").FindOne(ctx, filter).Decode(&d)
	if err != nil {
		return Contact{}, mapMongo(err)
	}
	return Contact(d), nil
}

func (s *MongoStore) CreateEnquiry(ctx context.Context, v Enquiry, a AuditEvent) error {
	return s.transaction(ctx, func(tx context.Context) error {
		source, err := s.database.Collection("enquiries").CountDocuments(tx, bson.M{"public_id": v.SourceEnquiryID, "reference": v.Reference, "service_id": v.ServiceID, "source": v.Source, "enquiry_type": v.EnquiryType})
		if err != nil {
			return err
		}
		if source != 1 {
			return ErrNotFound
		}
		contact, err := s.FindContact(tx, v.ContactID)
		if err != nil {
			return err
		}
		if v.OrganizationID != "" && contact.OrganizationID != v.OrganizationID {
			return ErrConflict
		}
		_, err = s.database.Collection("crm_enquiries").InsertOne(tx, enquiryDocument(v))
		if err != nil {
			return mapMongo(err)
		}
		if _, err = s.database.Collection("crm_stage_history").InsertOne(tx, bson.M{"public_id": a.PublicID, "enquiry_id": v.PublicID, "actor_id": a.ActorID, "from": "", "to": v.Stage, "created_at": a.CreatedAt}); err != nil {
			return mapMongo(err)
		}
		return s.audit(tx, a)
	})
}
func (s *MongoStore) ResolveSourceEnquiry(ctx context.Context, id string) (SourceEnquiry, error) {
	var document struct {
		PublicID    string `bson:"public_id"`
		Reference   string `bson:"reference"`
		ServiceID   string `bson:"service_id"`
		Source      string `bson:"source"`
		EnquiryType string `bson:"enquiry_type"`
		Contact     struct {
			Name         string `bson:"name"`
			Email        string `bson:"email"`
			Phone        string `bson:"phone"`
			Organization string `bson:"organization"`
			Role         string `bson:"role"`
			Country      string `bson:"country"`
		} `bson:"contact"`
	}
	if err := s.database.Collection("enquiries").FindOne(ctx, bson.M{"public_id": id}).Decode(&document); err != nil {
		return SourceEnquiry{}, mapMongo(err)
	}
	return SourceEnquiry{PublicID: document.PublicID, Reference: document.Reference, ServiceID: document.ServiceID, Source: document.Source, EnquiryType: document.EnquiryType, Contact: SourceContact{Name: document.Contact.Name, Email: document.Contact.Email, Phone: document.Contact.Phone, Organization: document.Contact.Organization, Role: document.Contact.Role, Country: document.Contact.Country}}, nil
}
func enquiryDocument(v Enquiry) bson.M {
	return bson.M{"public_id": v.PublicID, "source_enquiry_id": v.SourceEnquiryID, "reference": v.Reference, "contact_id": v.ContactID, "organization_id": v.OrganizationID, "service_id": v.ServiceID, "owner_id": v.OwnerID, "stage": v.Stage, "source": v.Source, "enquiry_type": v.EnquiryType, "summary": v.Summary, "created_at": v.CreatedAt, "updated_at": v.UpdatedAt}
}

type enquiryDoc struct {
	PublicID        string     `bson:"public_id"`
	SourceEnquiryID string     `bson:"source_enquiry_id"`
	Reference       string     `bson:"reference"`
	ContactID       string     `bson:"contact_id"`
	OrganizationID  string     `bson:"organization_id"`
	ServiceID       string     `bson:"service_id"`
	OwnerID         string     `bson:"owner_id"`
	Stage           Stage      `bson:"stage"`
	Source          string     `bson:"source"`
	EnquiryType     string     `bson:"enquiry_type"`
	Summary         string     `bson:"summary"`
	CreatedAt       time.Time  `bson:"created_at"`
	UpdatedAt       time.Time  `bson:"updated_at"`
	DeletedAt       *time.Time `bson:"deleted_at,omitempty"`
}

func fromEnquiryDoc(d enquiryDoc) Enquiry {
	return Enquiry(d)
}
func (s *MongoStore) ListEnquiries(ctx context.Context, f EnquiryFilter) ([]Enquiry, error) {
	filter := bson.M{}
	if !f.IncludeDeleted {
		filter["deleted_at"] = bson.M{"$exists": false}
	}
	if len(f.Stages) > 0 {
		filter["stage"] = bson.M{"$in": f.Stages}
	}
	if f.OwnerID != "" {
		filter["owner_id"] = f.OwnerID
	}
	if len(f.Sources) > 0 {
		filter["source"] = bson.M{"$in": f.Sources}
	}
	if f.ServiceID != "" {
		filter["service_id"] = f.ServiceID
	}
	if f.OrganizationID != "" {
		filter["organization_id"] = f.OrganizationID
	}
	if f.Query != "" {
		filter["$or"] = bson.A{bson.M{"reference": bson.M{"$regex": regexpQuote(f.Query), "$options": "i"}}, bson.M{"summary": bson.M{"$regex": regexpQuote(f.Query), "$options": "i"}}}
	}
	cursor, err := s.database.Collection("crm_enquiries").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "public_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var docs []enquiryDoc
	if err = cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	out := make([]Enquiry, len(docs))
	for i := range docs {
		out[i] = fromEnquiryDoc(docs[i])
	}
	return out, nil
}
func regexpQuote(v string) string {
	r := strings.NewReplacer(`\`, `\\`, `.`, `\.`, `*`, `\*`, `+`, `\+`, `?`, `\?`, `(`, `\(`, `)`, `\)`, `[`, `\[`, `]`, `\]`, `{`, `\{`, `}`, `\}`, `^`, `\^`, `$`, `\$`, `|`, `\|`)
	return r.Replace(v)
}
func (s *MongoStore) UpdateEnquiry(ctx context.Context, id string, mutate func(*Enquiry) error, a AuditEvent) (Enquiry, error) {
	var out Enquiry
	err := s.transaction(ctx, func(tx context.Context) error {
		var d enquiryDoc
		if err := s.database.Collection("crm_enquiries").FindOne(tx, bson.M{"public_id": id}).Decode(&d); err != nil {
			return mapMongo(err)
		}
		v := fromEnquiryDoc(d)
		if err := mutate(&v); err != nil {
			return err
		}
		set := bson.M{"owner_id": v.OwnerID, "stage": v.Stage, "updated_at": v.UpdatedAt}
		if v.DeletedAt != nil {
			set["deleted_at"] = *v.DeletedAt
		}
		r, err := s.database.Collection("crm_enquiries").UpdateOne(tx, bson.M{"public_id": id, "updated_at": d.UpdatedAt}, bson.M{"$set": set})
		if err != nil {
			return mapMongo(err)
		}
		if r.MatchedCount != 1 {
			return ErrConflict
		}
		if v.Stage != d.Stage {
			if _, err = s.database.Collection("crm_stage_history").InsertOne(tx, bson.M{"public_id": a.PublicID, "enquiry_id": id, "actor_id": a.ActorID, "from": d.Stage, "to": v.Stage, "created_at": a.CreatedAt}); err != nil {
				return mapMongo(err)
			}
			if v.OwnerID != "" {
				if _, err = s.database.Collection("crm_notification_deliveries").InsertOne(tx, bson.M{"public_id": a.PublicID, "enquiry_id": id, "task_id": "", "kind": "enquiry.stage_changed", "status": "pending", "attempts": 0, "next_attempt_at": a.CreatedAt, "created_at": a.CreatedAt, "updated_at": a.CreatedAt}); err != nil {
					return mapMongo(err)
				}
			}
		}
		if err = s.audit(tx, a); err != nil {
			return err
		}
		out = v
		return nil
	})
	return out, err
}

func (s *MongoStore) SaveView(ctx context.Context, v SavedView, a AuditEvent) error {
	return s.transaction(ctx, func(tx context.Context) error {
		_, err := s.database.Collection("crm_saved_views").InsertOne(tx, bson.M{"public_id": v.PublicID, "owner_id": v.OwnerID, "name": v.Name, "filter": v.Filter, "created_at": v.CreatedAt, "updated_at": v.UpdatedAt})
		if err != nil {
			return mapMongo(err)
		}
		return s.audit(tx, a)
	})
}
func (s *MongoStore) ListViews(ctx context.Context, owner string) ([]SavedView, error) {
	cursor, err := s.database.Collection("crm_saved_views").Find(ctx, bson.M{"owner_id": owner}, options.Find().SetSort(bson.D{{Key: "name", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var documents []struct {
		PublicID  string        `bson:"public_id"`
		OwnerID   string        `bson:"owner_id"`
		Name      string        `bson:"name"`
		Filter    EnquiryFilter `bson:"filter"`
		CreatedAt time.Time     `bson:"created_at"`
		UpdatedAt time.Time     `bson:"updated_at"`
	}
	if err = cursor.All(ctx, &documents); err != nil {
		return nil, err
	}
	out := make([]SavedView, len(documents))
	for index, document := range documents {
		out[index] = SavedView{PublicID: document.PublicID, OwnerID: document.OwnerID, Name: document.Name, Filter: document.Filter, CreatedAt: document.CreatedAt, UpdatedAt: document.UpdatedAt}
	}
	return out, nil
}
func (s *MongoStore) PrivacyExport(ctx context.Context, id string, a AuditEvent) (Contact, *Organization, []Enquiry, error) {
	var contact Contact
	var org *Organization
	var enquiries []Enquiry
	err := s.transaction(ctx, func(tx context.Context) error {
		var err error
		contact, err = s.FindContact(tx, id)
		if err != nil {
			return err
		}
		if contact.OrganizationID != "" {
			var d struct {
				PublicID    string     `bson:"public_id"`
				Name        string     `bson:"name"`
				Website     string     `bson:"website"`
				CountryCode string     `bson:"country_code"`
				CreatedAt   time.Time  `bson:"created_at"`
				UpdatedAt   time.Time  `bson:"updated_at"`
				DeletedAt   *time.Time `bson:"deleted_at,omitempty"`
			}
			if err = s.database.Collection("organizations").FindOne(tx, bson.M{"public_id": contact.OrganizationID, "deleted_at": bson.M{"$exists": false}}).Decode(&d); err == nil {
				org = &Organization{PublicID: d.PublicID, Name: d.Name, Website: d.Website, CountryCode: d.CountryCode, CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt}
			} else if !errors.Is(err, mongo.ErrNoDocuments) {
				return err
			}
		}
		enquiries, err = s.ListEnquiries(tx, EnquiryFilter{IncludeDeleted: true})
		if err != nil {
			return err
		}
		filtered := enquiries[:0]
		for _, v := range enquiries {
			if v.ContactID == id {
				filtered = append(filtered, v)
			}
		}
		enquiries = filtered
		return s.audit(tx, a)
	})
	return contact, org, enquiries, err
}
func (s *MongoStore) PrivacyDelete(ctx context.Context, id string, at time.Time, a AuditEvent) (PrivacyDeleteResult, error) {
	result := PrivacyDeleteResult{}
	err := s.transaction(ctx, func(tx context.Context) error {
		contact, err := s.FindContact(tx, id)
		if err != nil {
			return err
		}
		r, err := s.database.Collection("contacts").UpdateOne(tx, bson.M{"public_id": id, "deleted_at": bson.M{"$exists": false}}, bson.M{"$set": bson.M{"name": "Deleted contact", "email": "", "phone": "", "role": "", "country_code": "", "normalized_email": "", "normalized_phone": "", "organization_id": "", "deleted_at": at, "updated_at": at}})
		if err != nil || r.MatchedCount != 1 {
			return mapMongo(err)
		}
		result.Contacts = 1
		cursor, err := s.database.Collection("crm_enquiries").Find(tx, bson.M{"contact_id": id})
		if err != nil {
			return err
		}
		defer cursor.Close(tx)
		var linked []struct {
			PublicID        string `bson:"public_id"`
			SourceEnquiryID string `bson:"source_enquiry_id"`
		}
		if err = cursor.All(tx, &linked); err != nil {
			return err
		}
		for _, item := range linked {
			update := bson.M{"$set": bson.M{"contact.name": "Deleted contact", "contact.email": "deleted@example.invalid", "contact.phone": "", "contact.organization": "", "contact.role": "Deleted", "contact.country": "ZZ"}}
			result, sourceErr := s.database.Collection("enquiries").UpdateOne(tx, bson.M{"public_id": item.SourceEnquiryID}, update)
			if sourceErr != nil {
				return sourceErr
			}
			if result.MatchedCount != 1 {
				return ErrConflict
			}
			if _, err = s.database.Collection("crm_enquiry_notes").UpdateMany(tx, bson.M{"enquiry_id": item.PublicID}, bson.M{"$set": bson.M{"body": "[redacted]"}}); err != nil {
				return err
			}
			if _, err = s.database.Collection("crm_tasks").UpdateMany(tx, bson.M{"enquiry_id": item.PublicID}, bson.M{"$set": bson.M{"title": "Deleted contact follow-up"}}); err != nil {
				return err
			}
			if _, err = s.database.Collection("crm_proposal_attachments").UpdateMany(tx, bson.M{"enquiry_id": item.PublicID}, bson.M{"$set": bson.M{"label": "Retained private proposal"}}); err != nil {
				return err
			}
		}
		er, err := s.database.Collection("crm_enquiries").UpdateMany(tx, bson.M{"contact_id": id}, bson.M{"$set": bson.M{"contact_id": "", "summary": "", "deleted_at": at, "updated_at": at}})
		if err != nil {
			return err
		}
		result.Enquiries = int(er.ModifiedCount)
		if contact.OrganizationID != "" {
			refs, err := s.database.Collection("contacts").CountDocuments(tx, bson.M{"organization_id": contact.OrganizationID, "deleted_at": bson.M{"$exists": false}})
			if err != nil {
				return err
			}
			if refs == 0 {
				or, err := s.database.Collection("organizations").UpdateOne(tx, bson.M{"public_id": contact.OrganizationID, "deleted_at": bson.M{"$exists": false}}, bson.M{"$set": bson.M{"name": "Deleted organization", "normalized_name": "deleted-" + contact.OrganizationID, "website": "", "country_code": "", "deleted_at": at, "updated_at": at}})
				if err != nil {
					return err
				}
				result.Organizations = int(or.ModifiedCount)
			}
		}
		return s.audit(tx, a)
	})
	return result, err
}

var _ Store = (*MongoStore)(nil)
