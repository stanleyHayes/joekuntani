package crmworkflow

import (
	"context"
	"strings"
	"time"
)

type Audit struct {
	PublicID, ActorID, Action, EntityType, EntityID string
	CreatedAt                                       time.Time
}
type Store interface {
	EnquiryExists(context.Context, string) (bool, error)
	AssigneeExists(context.Context, string) (bool, error)
	CreateNote(context.Context, Note, Audit) error
	CreateTask(context.Context, Task, Audit) error
	CompleteTask(context.Context, string, string, time.Time, Audit) (Task, error)
	AddAttachment(context.Context, Attachment, Audit) error
	FindAttachment(context.Context, string, string) (Attachment, error)
	List(context.Context, string) ([]Note, []Task, []StageHistory, []Attachment, error)
	ListDeliveries(context.Context, string) ([]Delivery, error)
	RetryDelivery(context.Context, string, time.Time, Audit) error
	RecordAudit(context.Context, Audit) error
}
type AssetAccess interface {
	PrivateDownload(context.Context, string, time.Duration) (string, time.Time, error)
	IsProtectedReadyDocument(context.Context, string) (bool, error)
}
type Telemetry interface {
	Count(context.Context, string, map[string]string)
}
type Service struct {
	store     Store
	assets    AssetAccess
	telemetry Telemetry
	now       func() time.Time
	id        func() (string, error)
}

func New(store Store, assets AssetAccess, telemetry Telemetry, now func() time.Time, id func() (string, error)) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{store: store, assets: assets, telemetry: telemetry, now: now, id: id}
}
func (s *Service) audit(a Actor, action, typ, id string) Audit {
	public, _ := s.id()
	return Audit{public, a.InternalID, action, typ, id, s.now().UTC()}
}
func (s *Service) require(ctx context.Context, a Actor, enquiry string, p Permission) error {
	if !a.Allows(p) {
		return ErrForbidden
	}
	if strings.TrimSpace(enquiry) == "" {
		return ErrInvalid
	}
	ok, err := s.store.EnquiryExists(ctx, enquiry)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}
func (s *Service) AddNote(ctx context.Context, a Actor, enquiry string, in NoteInput) (Note, error) {
	if err := s.require(ctx, a, enquiry, PermissionWrite); err != nil {
		return Note{}, err
	}
	in.Body = strings.TrimSpace(in.Body)
	if len(in.Body) < 1 || len(in.Body) > 4000 {
		return Note{}, ErrInvalid
	}
	id, err := s.id()
	if err != nil {
		return Note{}, err
	}
	n := Note{id, enquiry, a.InternalID, in.Body, s.now().UTC()}
	err = s.store.CreateNote(ctx, n, s.audit(a, "enquiry.note.create", "enquiry_note", id))
	if err == nil && s.telemetry != nil {
		s.telemetry.Count(ctx, "crm_note_created", map[string]string{})
	}
	return n, err
}
func (s *Service) AddTask(ctx context.Context, a Actor, enquiry string, in TaskInput) (Task, error) {
	if err := s.require(ctx, a, enquiry, PermissionWrite); err != nil {
		return Task{}, err
	}
	in.Title = normalizeText(in.Title)
	now := s.now().UTC()
	if len(in.Title) < 1 || len(in.Title) > 200 || in.AssigneeID == "" || !validPriority(in.Priority) || in.DueAt.Before(now.Add(-time.Minute)) {
		return Task{}, ErrInvalid
	}
	ok, err := s.store.AssigneeExists(ctx, in.AssigneeID)
	if err != nil {
		return Task{}, err
	}
	if !ok {
		return Task{}, ErrNotFound
	}
	id, err := s.id()
	if err != nil {
		return Task{}, err
	}
	deliveryID, err := s.id()
	if err != nil {
		return Task{}, err
	}
	t := Task{PublicID: id, EnquiryID: enquiry, Title: in.Title, AssigneeID: in.AssigneeID, Priority: in.Priority, Status: TaskOpen, DueAt: in.DueAt.UTC(), CreatedAt: now, UpdatedAt: now, DeliveryID: deliveryID}
	err = s.store.CreateTask(ctx, t, s.audit(a, "task.create", "task", id))
	if err == nil && s.telemetry != nil {
		s.telemetry.Count(ctx, "crm_task_created", map[string]string{"priority": string(in.Priority)})
	}
	return t, err
}
func (s *Service) CompleteTask(ctx context.Context, a Actor, enquiry, id string) (Task, error) {
	if err := s.require(ctx, a, enquiry, PermissionWrite); err != nil {
		return Task{}, err
	}
	return s.store.CompleteTask(ctx, enquiry, id, s.now().UTC(), s.audit(a, "task.complete", "task", id))
}
func (s *Service) AddAttachment(ctx context.Context, a Actor, enquiry string, in AttachmentInput) (Attachment, error) {
	if err := s.require(ctx, a, enquiry, PermissionWrite); err != nil {
		return Attachment{}, err
	}
	in.Label = normalizeText(in.Label)
	if in.AssetID == "" || len(in.Label) < 1 || len(in.Label) > 200 {
		return Attachment{}, ErrInvalid
	}
	ok, err := s.assets.IsProtectedReadyDocument(ctx, in.AssetID)
	if err != nil {
		return Attachment{}, err
	}
	if !ok {
		return Attachment{}, ErrInvalid
	}
	id, err := s.id()
	if err != nil {
		return Attachment{}, err
	}
	v := Attachment{id, enquiry, in.AssetID, in.Label, a.InternalID, s.now().UTC()}
	err = s.store.AddAttachment(ctx, v, s.audit(a, "proposal_attachment.add", "proposal_attachment", id))
	if err == nil && s.telemetry != nil {
		s.telemetry.Count(ctx, "crm_proposal_attachment_added", map[string]string{"media_type": "document"})
	}
	return v, err
}
func (s *Service) AttachmentURL(ctx context.Context, a Actor, enquiry, id string) (AttachmentAccess, error) {
	if err := s.require(ctx, a, enquiry, PermissionRead); err != nil {
		return AttachmentAccess{}, err
	}
	v, err := s.store.FindAttachment(ctx, enquiry, id)
	if err != nil {
		return AttachmentAccess{}, err
	}
	u, exp, err := s.assets.PrivateDownload(ctx, v.AssetID, 5*time.Minute)
	if err != nil {
		return AttachmentAccess{}, err
	}
	if err = s.store.RecordAudit(ctx, s.audit(a, "proposal_attachment.access", "proposal_attachment", id)); err != nil {
		return AttachmentAccess{}, err
	}
	return AttachmentAccess{v, u, exp}, nil
}
func (s *Service) List(ctx context.Context, a Actor, enquiry string) ([]Note, []Task, []StageHistory, []Attachment, error) {
	if err := s.require(ctx, a, enquiry, PermissionRead); err != nil {
		return nil, nil, nil, nil, err
	}
	return s.store.List(ctx, enquiry)
}
func (s *Service) Deliveries(ctx context.Context, a Actor, enquiry string) ([]Delivery, error) {
	if err := s.require(ctx, a, enquiry, PermissionRead); err != nil {
		return nil, err
	}
	return s.store.ListDeliveries(ctx, enquiry)
}
func (s *Service) Retry(ctx context.Context, a Actor, enquiry, id string) error {
	if err := s.require(ctx, a, enquiry, PermissionRetry); err != nil {
		return err
	}
	err := s.store.RetryDelivery(ctx, id, s.now().UTC(), s.audit(a, "notification.retry", "notification_delivery", id))
	if err == nil && s.telemetry != nil {
		s.telemetry.Count(ctx, "crm_notification_retry", map[string]string{})
	}
	return err
}
