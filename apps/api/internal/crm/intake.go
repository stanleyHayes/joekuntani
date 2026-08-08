package crm

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// anonymizedEnquiryEmail is the address the privacy retention worker writes
// over a purged enquiry. Promoting one of those would recreate the contact
// record retention had just erased, so intake skips them.
const anonymizedEnquiryEmail = "deleted@example.invalid"

// IntakeWorker promotes public enquiries into the CRM.
//
// A submission lands in `enquiries`; the console reads `crm_enquiries`. Nothing
// bridged the two, so every booking enquiry sat in a collection no screen
// queried. This worker closes that gap: it finds enquiries with no CRM record,
// resolves or creates the organization and contact, and files the lead at the
// `new` stage.
//
// It is idempotent by construction. The unique index on
// crm_enquiries.source_enquiry_id means a duplicate promotion — from a retry, a
// second replica, or a crash between the insert and the next scan — loses the
// race and is skipped rather than filed twice.
type IntakeWorker struct {
	pending PendingEnquiries
	store   Store
	service *Service
	actor   Actor
}

// PendingEnquiry is a public submission awaiting promotion.
type PendingEnquiry struct{ PublicID, ProjectBrief string }

// PendingEnquiries locates submissions the console cannot see yet. It is an
// interface so the promotion logic can be exercised without a live database —
// the query below is the only part that genuinely needs one.
type PendingEnquiries interface {
	Unfiled(ctx context.Context, limit int) ([]PendingEnquiry, error)
}

// SystemIntakeActor is the identity intake files leads under. The zero
// ObjectID makes machine-created records obvious in the audit trail instead of
// attributing them to whichever administrator happened to be signed in.
func SystemIntakeActor() Actor {
	return Actor{
		InternalID:  "000000000000000000000000",
		Permissions: map[Permission]bool{PermissionRead: true, PermissionWrite: true},
	}
}

func NewIntakeWorker(pending PendingEnquiries, store Store, service *Service) *IntakeWorker {
	return &IntakeWorker{pending: pending, store: store, service: service, actor: SystemIntakeActor()}
}

// RunOnce promotes up to limit unfiled enquiries, oldest first.
//
// A single enquiry that cannot be promoted — malformed contact details, a
// concurrent writer — is skipped so it cannot block the ones behind it. The
// error returned is the last such failure, which surfaces the problem in the
// worker log without stalling the queue.
func (w *IntakeWorker) RunOnce(ctx context.Context, limit int) error {
	if limit < 1 || limit > 500 {
		return ErrInvalid
	}
	pending, err := w.pending.Unfiled(ctx, limit)
	if err != nil {
		return err
	}
	var last error
	for _, item := range pending {
		if err = w.promote(ctx, item); err != nil && !errors.Is(err, ErrConflict) {
			last = err
		}
	}
	return last
}

// MongoPendingEnquiries finds enquiries with no crm_enquiries row pointing back
// at them. The $lookup resolves through the unique source_enquiry_id index, so
// this stays cheap as the enquiry collection grows.
type MongoPendingEnquiries struct{ db *mongo.Database }

func NewMongoPendingEnquiries(db *mongo.Database) *MongoPendingEnquiries {
	return &MongoPendingEnquiries{db: db}
}

func (m *MongoPendingEnquiries) Unfiled(ctx context.Context, limit int) ([]PendingEnquiry, error) {
	cursor, err := m.db.Collection("enquiries").Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"contact.email": bson.M{"$nin": bson.A{"", anonymizedEnquiryEmail}}}}},
		{{Key: "$sort", Value: bson.D{{Key: "created_at", Value: 1}}}},
		{{Key: "$lookup", Value: bson.M{"from": "crm_enquiries", "localField": "public_id", "foreignField": "source_enquiry_id", "as": "filed"}}},
		{{Key: "$match", Value: bson.M{"filed": bson.M{"$size": 0}}}},
		{{Key: "$limit", Value: limit}},
		{{Key: "$project", Value: bson.M{"_id": 0, "public_id": 1, "project_brief": 1}}},
	})
	if err != nil {
		return nil, err
	}
	defer func() { _ = cursor.Close(ctx) }()
	var pending []struct {
		PublicID     string `bson:"public_id"`
		ProjectBrief string `bson:"project_brief"`
	}
	if err = cursor.All(ctx, &pending); err != nil {
		return nil, err
	}
	items := make([]PendingEnquiry, 0, len(pending))
	for _, row := range pending {
		items = append(items, PendingEnquiry{PublicID: row.PublicID, ProjectBrief: row.ProjectBrief})
	}
	return items, nil
}

func (w *IntakeWorker) promote(ctx context.Context, item PendingEnquiry) error {
	source, err := w.store.ResolveSourceEnquiry(ctx, item.PublicID)
	if err != nil {
		return err
	}
	contact, err := w.resolveContact(ctx, source.Contact)
	if err != nil {
		return err
	}
	// The store rejects an enquiry whose organization disagrees with its
	// contact's, so the contact's own organization is the only safe value —
	// an existing contact may already sit under a different one.
	_, err = w.service.CreateEnquiry(ctx, w.actor, EnquiryInput{
		SourceEnquiryID: source.PublicID,
		ContactID:       contact.PublicID,
		OrganizationID:  contact.OrganizationID,
		Summary:         summarize(item.ProjectBrief),
	})
	return err
}

// resolveOrganization returns an empty id rather than failing when the enquirer
// named no organization, or named one too short to be a real record. An
// individual booking is a normal case, not an error.
func (w *IntakeWorker) resolveOrganization(ctx context.Context, contact SourceContact) (string, error) {
	name := collapseSpace(contact.Organization)
	if name == "" {
		return "", nil
	}
	found, err := w.service.LookupOrganization(ctx, w.actor, name)
	if err == nil {
		return found.PublicID, nil
	}
	if errors.Is(err, ErrInvalid) {
		return "", nil
	}
	if !errors.Is(err, ErrNotFound) {
		return "", err
	}
	created, err := w.service.CreateOrganization(ctx, w.actor, OrganizationInput{Name: name, CountryCode: contact.Country})
	if err == nil {
		return created.PublicID, nil
	}
	// A concurrent intake pass won the race; its record is the one to use.
	if errors.Is(err, ErrConflict) {
		return created.PublicID, nil
	}
	if errors.Is(err, ErrInvalid) {
		return "", nil
	}
	return "", err
}

// resolveContact prefers an existing contact, and only then reaches for an
// organization. Resolving the organization first would mint a record for an
// enquirer the CRM already knows — whose organization is whatever it already
// was — leaving the new one orphaned and the directory full of near-duplicates.
func (w *IntakeWorker) resolveContact(ctx context.Context, source SourceContact) (Contact, error) {
	found, err := w.service.LookupContact(ctx, w.actor, source.Email, source.Phone)
	if err == nil {
		return found, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return Contact{}, err
	}
	organizationID, err := w.resolveOrganization(ctx, source)
	if err != nil {
		return Contact{}, err
	}
	input := ContactInput{
		OrganizationID: organizationID,
		Name:           source.Name,
		Email:          source.Email,
		Phone:          contactPhone(source.Phone),
		Role:           source.Role,
		CountryCode:    source.Country,
	}
	created, err := w.service.CreateContact(ctx, w.actor, input)
	// CreateContact hands back the existing record alongside ErrConflict when
	// a lookup raced it, so that record is usable as-is.
	if err == nil || errors.Is(err, ErrConflict) {
		return created, nil
	}
	return Contact{}, err
}

// contactPhone drops a number the CRM will not accept.
//
// The public enquiry form allows up to 40 characters and no lower bound, while
// a CRM contact requires 7 to 20. A number outside that range failed the whole
// promotion, and since intake retries every 15 seconds the enquiry was
// reattempted forever and blocked the queue behind it. The email is the
// identifying field here, so a phone number that cannot be stored is dropped
// rather than allowed to cost the lead — it remains on the source enquiry.
func contactPhone(phone string) string {
	normalized := normalizePhone(phone)
	if len(normalized) < 7 || len(normalized) > 20 {
		return ""
	}
	return normalized
}

// summarize gives the console something to read in the list before anyone
// opens the record. The store caps summaries at 2000 characters.
// summarize gives the console something to read in the list before anyone opens
// the record.
//
// The store's own limit is 2000 measured three ways at once: valid UTF-8, at
// most 2000 runes, and at most 2000 bytes. Slicing at byte 1999 and appending a
// three-byte ellipsis produced 2002 bytes, and could cut a multi-byte character
// in half — so every enquiry with a long brief was rejected, and because intake
// works oldest-first those rejects head-blocked every enquiry behind them.
func summarize(brief string) string {
	brief = strings.ToValidUTF8(strings.TrimSpace(brief), "")
	const limit = 2000
	if utf8.RuneCountInString(brief) <= limit && len(brief) <= limit {
		return brief
	}
	const ellipsis = "…"
	runeBudget := limit - utf8.RuneCountInString(ellipsis)
	byteBudget := limit - len(ellipsis)
	var trimmed strings.Builder
	runes := 0
	for _, character := range brief {
		if runes >= runeBudget || trimmed.Len()+utf8.RuneLen(character) > byteBudget {
			break
		}
		trimmed.WriteRune(character)
		runes++
	}
	return trimmed.String() + ellipsis
}
