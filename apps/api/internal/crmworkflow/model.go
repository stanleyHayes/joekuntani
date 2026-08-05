package crmworkflow

import (
	"errors"
	"strings"
	"time"
)

var (
	ErrForbidden = errors.New("crm workflow operation forbidden")
	ErrInvalid   = errors.New("invalid crm workflow input")
	ErrNotFound  = errors.New("crm workflow record not found")
	ErrConflict  = errors.New("crm workflow record conflict")
)

type Permission string

const (
	PermissionRead  Permission = "crm.read"
	PermissionWrite Permission = "crm.write"
	PermissionRetry Permission = "crm.notifications.retry"
)

type Actor struct {
	InternalID  string
	Permissions map[Permission]bool
}

func (a Actor) Allows(p Permission) bool { return a.InternalID != "" && a.Permissions[p] }

type Note struct {
	PublicID  string    `json:"id" bson:"public_id"`
	EnquiryID string    `json:"enquiry_id" bson:"enquiry_id"`
	AuthorID  string    `json:"author_id" bson:"author_id"`
	Body      string    `json:"body" bson:"body"`
	CreatedAt time.Time `json:"created_at" bson:"created_at"`
}

type Priority string
type TaskStatus string

const (
	PriorityLow    Priority   = "low"
	PriorityNormal Priority   = "normal"
	PriorityHigh   Priority   = "high"
	PriorityUrgent Priority   = "urgent"
	TaskOpen       TaskStatus = "open"
	TaskDone       TaskStatus = "done"
)

type Task struct {
	PublicID   string     `json:"id" bson:"public_id"`
	EnquiryID  string     `json:"enquiry_id" bson:"enquiry_id"`
	Title      string     `json:"title" bson:"title"`
	AssigneeID string     `json:"assignee_id" bson:"assignee_id"`
	Priority   Priority   `json:"priority" bson:"priority"`
	Status     TaskStatus `json:"status" bson:"status"`
	DueAt      time.Time  `json:"due_at" bson:"due_at"`
	CreatedAt  time.Time  `json:"created_at" bson:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at" bson:"updated_at"`
	DeliveryID string     `json:"-" bson:"-"`
}

type StageHistory struct {
	PublicID  string    `json:"id" bson:"public_id"`
	EnquiryID string    `json:"enquiry_id" bson:"enquiry_id"`
	ActorID   string    `json:"actor_id" bson:"actor_id"`
	From      string    `json:"from" bson:"from"`
	To        string    `json:"to" bson:"to"`
	CreatedAt time.Time `json:"created_at" bson:"created_at"`
}

type Attachment struct {
	PublicID  string    `json:"id" bson:"public_id"`
	EnquiryID string    `json:"enquiry_id" bson:"enquiry_id"`
	AssetID   string    `json:"asset_id" bson:"asset_id"`
	Label     string    `json:"label" bson:"label"`
	AddedBy   string    `json:"added_by" bson:"added_by"`
	CreatedAt time.Time `json:"created_at" bson:"created_at"`
}

type AttachmentAccess struct {
	Attachment Attachment `json:"attachment"`
	URL        string     `json:"url"`
	ExpiresAt  time.Time  `json:"expires_at"`
}

type Delivery struct {
	PublicID      string    `json:"id" bson:"public_id"`
	EnquiryID     string    `json:"enquiry_id" bson:"enquiry_id"`
	Kind          string    `json:"kind" bson:"kind"`
	Status        string    `json:"status" bson:"status"`
	LastErrorCode string    `json:"last_error_code,omitempty" bson:"last_error_code"`
	Attempts      int       `json:"attempts" bson:"attempts"`
	NextAttemptAt time.Time `json:"next_attempt_at" bson:"next_attempt_at"`
	CreatedAt     time.Time `json:"created_at" bson:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" bson:"updated_at"`
}

type NoteInput struct {
	Body string `json:"body"`
}
type TaskInput struct {
	Title, AssigneeID string
	Priority          Priority
	DueAt             time.Time
}
type AttachmentInput struct {
	AssetID string `json:"asset_id"`
	Label   string `json:"label"`
}

func normalizeText(v string) string { return strings.Join(strings.Fields(v), " ") }
func validPriority(v Priority) bool {
	return v == PriorityLow || v == PriorityNormal || v == PriorityHigh || v == PriorityUrgent
}
