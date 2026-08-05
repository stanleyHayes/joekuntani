package campaigns

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"
)

type Actor struct{ ID, Role string }
type Filter struct {
	Status                   Status
	OrganizationID, Platform string
	IncludeDeleted           bool
}
type Store interface {
	Create(context.Context, Campaign, Actor) error
	Update(context.Context, Campaign, Actor) error
	Find(context.Context, string) (Campaign, error)
	List(context.Context, Filter) ([]Campaign, error)
	SoftDelete(context.Context, string, time.Time, Actor) error
	CreateDeliverable(context.Context, Deliverable, Actor) error
	UpdateDeliverable(context.Context, Deliverable, Actor) error
	FindDeliverable(context.Context, string, string) (Deliverable, error)
	ListDeliverables(context.Context, string) ([]Deliverable, error)
}
type References interface {
	EnquiryExists(context.Context, string) bool
	OrganizationExists(context.Context, string) bool
	MediaReady(context.Context, string) bool
}
type Telemetry interface {
	Record(context.Context, string, map[string]string)
}
type Service struct {
	store      Store
	references References
	telemetry  Telemetry
	now        func() time.Time
	id         func() string
}

func NewService(store Store, references References, telemetry Telemetry) *Service {
	return &Service{store: store, references: references, telemetry: telemetry, now: time.Now, id: uuid}
}

func (s *Service) Create(ctx context.Context, actor Actor, in Input) (Campaign, error) {
	if !canWrite(actor) {
		return Campaign{}, ErrForbidden
	}
	start, end, err := validateInput(in)
	if err != nil {
		return Campaign{}, err
	}
	if in.Status != StatusDraft {
		return Campaign{}, ErrInvalid
	}
	if s.references == nil || !s.references.EnquiryExists(ctx, in.EnquiryID) || !s.references.OrganizationExists(ctx, in.OrganizationID) || !s.assetsReady(ctx, in.AssetIDs) {
		return Campaign{}, ErrInvalid
	}
	now := s.now().UTC()
	item := Campaign{PublicID: s.id(), EnquiryID: in.EnquiryID, OrganizationID: in.OrganizationID, Title: strings.TrimSpace(in.Title), Objective: strings.TrimSpace(in.Objective), Platforms: trimAll(in.Platforms), StartsOn: start, EndsOn: end, Status: in.Status, Fee: in.Fee, Expenses: in.Expenses, Results: in.Results, AssetIDs: in.AssetIDs, CreatedAt: now, UpdatedAt: now}
	if err = s.store.Create(ctx, item, actor); err != nil {
		return Campaign{}, err
	}
	s.record(ctx, "campaign.created", item.PublicID)
	return item, nil
}
func (s *Service) Update(ctx context.Context, actor Actor, id string, in Input) (Campaign, error) {
	if !canWrite(actor) {
		return Campaign{}, ErrForbidden
	}
	if !publicID.MatchString(id) {
		return Campaign{}, ErrInvalid
	}
	current, err := s.store.Find(ctx, id)
	if err != nil {
		return Campaign{}, err
	}
	start, end, err := validateInput(in)
	if err != nil {
		return Campaign{}, err
	}
	if current.DeletedAt != nil || in.EnquiryID != current.EnquiryID || in.OrganizationID != current.OrganizationID || !validTransition(current.Status, in.Status) || !s.assetsReady(ctx, in.AssetIDs) {
		return Campaign{}, ErrConflict
	}
	current.Title, current.Objective, current.Platforms, current.StartsOn, current.EndsOn, current.Status, current.Fee, current.Expenses, current.Results, current.AssetIDs, current.UpdatedAt = strings.TrimSpace(in.Title), strings.TrimSpace(in.Objective), trimAll(in.Platforms), start, end, in.Status, in.Fee, in.Expenses, in.Results, in.AssetIDs, s.now().UTC()
	if err = s.store.Update(ctx, current, actor); err != nil {
		return Campaign{}, err
	}
	s.record(ctx, "campaign.updated", id)
	return current, nil
}
func (s *Service) AddDeliverable(ctx context.Context, actor Actor, campaignID string, in DeliverableInput) (Deliverable, error) {
	if !canWrite(actor) {
		return Deliverable{}, ErrForbidden
	}
	if !publicID.MatchString(campaignID) {
		return Deliverable{}, ErrInvalid
	}
	campaign, err := s.store.Find(ctx, campaignID)
	if err != nil || campaign.DeletedAt != nil {
		return Deliverable{}, ErrNotFound
	}
	due, err := validateDeliverable(in)
	if err != nil || !s.assetsReady(ctx, in.AssetIDs) {
		return Deliverable{}, ErrInvalid
	}
	if in.Status != DeliverablePending || in.Approval != ApprovalPending || in.PublishedURL != "" {
		return Deliverable{}, ErrInvalid
	}
	now := s.now().UTC()
	item := Deliverable{PublicID: s.id(), CampaignID: campaignID, Title: strings.TrimSpace(in.Title), Platform: strings.TrimSpace(in.Platform), Format: strings.TrimSpace(in.Format), DueAt: due, Status: in.Status, PublishedURL: in.PublishedURL, Approval: in.Approval, AssetIDs: in.AssetIDs, CreatedAt: now, UpdatedAt: now}
	if err = s.store.CreateDeliverable(ctx, item, actor); err != nil {
		return Deliverable{}, err
	}
	s.record(ctx, "campaign.deliverable_created", item.PublicID)
	return item, nil
}
func (s *Service) UpdateDeliverable(ctx context.Context, actor Actor, campaignID, id string, in DeliverableInput) (Deliverable, error) {
	if !canWrite(actor) {
		return Deliverable{}, ErrForbidden
	}
	if !publicID.MatchString(campaignID) || !publicID.MatchString(id) {
		return Deliverable{}, ErrInvalid
	}
	current, err := s.store.FindDeliverable(ctx, campaignID, id)
	if err != nil {
		return Deliverable{}, err
	}
	campaign, err := s.store.Find(ctx, campaignID)
	if err != nil || campaign.DeletedAt != nil {
		return Deliverable{}, ErrNotFound
	}
	due, err := validateDeliverable(in)
	if err != nil || !s.assetsReady(ctx, in.AssetIDs) {
		return Deliverable{}, ErrInvalid
	}
	if !validDeliverableTransition(current.Status, in.Status) || !validApprovalTransition(current.Approval, in.Approval) {
		return Deliverable{}, ErrConflict
	}
	current.Title, current.Platform, current.Format, current.DueAt, current.Status, current.PublishedURL, current.Approval, current.AssetIDs, current.UpdatedAt = strings.TrimSpace(in.Title), strings.TrimSpace(in.Platform), strings.TrimSpace(in.Format), due, in.Status, in.PublishedURL, in.Approval, in.AssetIDs, s.now().UTC()
	if err = s.store.UpdateDeliverable(ctx, current, actor); err != nil {
		return Deliverable{}, err
	}
	s.record(ctx, "campaign.deliverable_updated", id)
	return current, nil
}
func (s *Service) List(ctx context.Context, actor Actor, filter Filter) ([]Campaign, error) {
	if !canRead(actor) {
		return nil, ErrForbidden
	}
	return s.store.List(ctx, filter)
}
func (s *Service) Detail(ctx context.Context, actor Actor, id string) (Campaign, []Deliverable, error) {
	if !canRead(actor) {
		return Campaign{}, nil, ErrForbidden
	}
	if !publicID.MatchString(id) {
		return Campaign{}, nil, ErrInvalid
	}
	item, err := s.store.Find(ctx, id)
	if err != nil {
		return Campaign{}, nil, err
	}
	deliverables, err := s.store.ListDeliverables(ctx, id)
	return item, deliverables, err
}
func (s *Service) Delete(ctx context.Context, actor Actor, id string) error {
	if !canWrite(actor) {
		return ErrForbidden
	}
	if !publicID.MatchString(id) {
		return ErrInvalid
	}
	if err := s.store.SoftDelete(ctx, id, s.now().UTC(), actor); err != nil {
		return err
	}
	s.record(ctx, "campaign.deleted", id)
	return nil
}
func (s *Service) assetsReady(ctx context.Context, ids []string) bool {
	for _, id := range ids {
		if s.references == nil || !s.references.MediaReady(ctx, id) {
			return false
		}
	}
	return true
}
func (s *Service) record(ctx context.Context, event, id string) {
	if s.telemetry != nil {
		s.telemetry.Record(ctx, event, map[string]string{"campaign_id": id})
	}
}
func canWrite(actor Actor) bool {
	return actor.ID != "" && (actor.Role == "administrator" || actor.Role == "booking_manager")
}
func canRead(actor Actor) bool { return actor.ID != "" && (canWrite(actor) || actor.Role == "analyst") }
func validTransition(from, to Status) bool {
	if from == to {
		return true
	}
	allowed := map[Status][]Status{StatusDraft: {StatusActive, StatusCancelled}, StatusActive: {StatusPaused, StatusCompleted, StatusCancelled}, StatusPaused: {StatusActive, StatusCompleted, StatusCancelled}}
	for _, value := range allowed[from] {
		if value == to {
			return true
		}
	}
	return false
}
func validDeliverableTransition(from, to DeliverableStatus) bool {
	if from == to {
		return true
	}
	allowed := map[DeliverableStatus]DeliverableStatus{
		DeliverablePending:    DeliverableInProgress,
		DeliverableInProgress: DeliverableSubmitted,
		DeliverableSubmitted:  DeliverableApproved,
		DeliverableApproved:   DeliverablePublished,
	}
	return allowed[from] == to
}
func validApprovalTransition(from, to ApprovalStatus) bool {
	if from == to {
		return true
	}
	return (from == ApprovalPending && (to == ApprovalApproved || to == ApprovalRejected)) || (from == ApprovalRejected && to == ApprovalPending)
}
func trimAll(values []string) []string {
	result := make([]string, len(values))
	for i := range values {
		result[i] = strings.TrimSpace(values[i])
	}
	return result
}
func uuid() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	value := hex.EncodeToString(b[:])
	return value[:8] + "-" + value[8:12] + "-" + value[12:16] + "-" + value[16:20] + "-" + value[20:]
}
