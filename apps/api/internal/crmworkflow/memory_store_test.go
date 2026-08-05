package crmworkflow

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

type memoryStore struct {
	notes       []Note
	tasks       map[string]Task
	attachments map[string]Attachment
	deliveries  map[string]Delivery
	audits      []Audit
}

func (m *memoryStore) EnquiryExists(context.Context, string) (bool, error)  { return true, nil }
func (m *memoryStore) AssigneeExists(context.Context, string) (bool, error) { return true, nil }
func (m *memoryStore) CreateNote(_ context.Context, v Note, a Audit) error {
	m.notes = append(m.notes, v)
	m.audits = append(m.audits, a)
	return nil
}
func (m *memoryStore) CreateTask(_ context.Context, v Task, a Audit) error {
	m.tasks[v.PublicID] = v
	m.audits = append(m.audits, a)
	return nil
}
func (m *memoryStore) CompleteTask(_ context.Context, enquiry, id string, at time.Time, a Audit) (Task, error) {
	v, ok := m.tasks[id]
	if !ok || v.EnquiryID != enquiry {
		return Task{}, ErrNotFound
	}
	if v.Status == TaskDone {
		return Task{}, ErrConflict
	}
	v.Status = TaskDone
	v.UpdatedAt = at
	m.tasks[id] = v
	m.audits = append(m.audits, a)
	return v, nil
}
func (m *memoryStore) AddAttachment(_ context.Context, v Attachment, a Audit) error {
	m.attachments[v.PublicID] = v
	m.audits = append(m.audits, a)
	return nil
}
func (m *memoryStore) FindAttachment(_ context.Context, enquiry, id string) (Attachment, error) {
	v, ok := m.attachments[id]
	if !ok || v.EnquiryID != enquiry {
		return Attachment{}, ErrNotFound
	}
	return v, nil
}
func (m *memoryStore) List(context.Context, string) ([]Note, []Task, []StageHistory, []Attachment, error) {
	tasks := []Task{}
	for _, v := range m.tasks {
		tasks = append(tasks, v)
	}
	atts := []Attachment{}
	for _, v := range m.attachments {
		atts = append(atts, v)
	}
	return m.notes, tasks, nil, atts, nil
}
func (m *memoryStore) ListDeliveries(context.Context, string) ([]Delivery, error) {
	out := []Delivery{}
	for _, v := range m.deliveries {
		out = append(out, v)
	}
	return out, nil
}
func (m *memoryStore) RetryDelivery(_ context.Context, id string, at time.Time, a Audit) error {
	v, ok := m.deliveries[id]
	if !ok {
		return ErrNotFound
	}
	if v.Status != "failed" && v.Status != "dead_letter" {
		return ErrConflict
	}
	v.Status = "pending"
	v.Attempts = 0
	v.NextAttemptAt = at
	v.UpdatedAt = at
	v.LastErrorCode = ""
	m.deliveries[id] = v
	m.audits = append(m.audits, a)
	return nil
}
func (m *memoryStore) RecordAudit(_ context.Context, a Audit) error {
	m.audits = append(m.audits, a)
	return nil
}

type assets struct{ ready bool }

func (a assets) IsProtectedReadyDocument(context.Context, string) (bool, error) { return a.ready, nil }
func (a assets) PrivateDownload(context.Context, string, time.Duration) (string, time.Time, error) {
	return "https://private.example/signed", time.Date(2026, 8, 5, 17, 5, 0, 0, time.UTC), nil
}

func TestWorkflowSecurityLifecycle(t *testing.T) {
	store := &memoryStore{tasks: map[string]Task{}, attachments: map[string]Attachment{}, deliveries: map[string]Delivery{"delivery": {PublicID: "delivery", EnquiryID: "enquiry", Status: "dead_letter"}}}
	n := 0
	ids := func() (string, error) { n++; return fmt.Sprintf("id-%d", n), nil }
	now := func() time.Time { return time.Date(2026, 8, 5, 17, 0, 0, 0, time.UTC) }
	service := New(store, assets{true}, nil, now, ids)
	writer := Actor{InternalID: "staff", Permissions: map[Permission]bool{PermissionRead: true, PermissionWrite: true, PermissionRetry: true}}
	if _, err := service.AddNote(context.Background(), Actor{}, "enquiry", NoteInput{Body: "secret"}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("unauthorized note=%v", err)
	}
	note, err := service.AddNote(context.Background(), writer, "enquiry", NoteInput{Body: " private note "})
	if err != nil || note.Body != "private note" {
		t.Fatalf("note=%#v %v", note, err)
	}
	task, err := service.AddTask(context.Background(), writer, "enquiry", TaskInput{Title: " Call client ", AssigneeID: "owner", Priority: PriorityUrgent, DueAt: now().Add(time.Hour)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.CompleteTask(context.Background(), writer, "enquiry", task.PublicID); err != nil {
		t.Fatal(err)
	}
	if _, err = service.CompleteTask(context.Background(), writer, "enquiry", task.PublicID); !errors.Is(err, ErrConflict) {
		t.Fatalf("repeat complete=%v", err)
	}
	attachment, err := service.AddAttachment(context.Background(), writer, "enquiry", AttachmentInput{AssetID: "protected-ready-pdf", Label: " Proposal "})
	if err != nil {
		t.Fatal(err)
	}
	access, err := service.AttachmentURL(context.Background(), writer, "enquiry", attachment.PublicID)
	if err != nil || access.URL != "https://private.example/signed" {
		t.Fatalf("access=%#v %v", access, err)
	}
	if err = service.Retry(context.Background(), writer, "enquiry", "delivery"); err != nil {
		t.Fatal(err)
	}
	if store.deliveries["delivery"].Status != "pending" {
		t.Fatal("delivery not requeued")
	}
}

func TestAttachmentMustBeProtectedReadyDocument(t *testing.T) {
	s := New(&memoryStore{}, assets{false}, nil, time.Now, func() (string, error) { return "id", nil })
	a := Actor{InternalID: "staff", Permissions: map[Permission]bool{PermissionWrite: true}}
	if _, err := s.AddAttachment(context.Background(), a, "enquiry", AttachmentInput{AssetID: "public-image", Label: "Proposal"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("attachment=%v", err)
	}
}
