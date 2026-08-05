package checkin

import "time"

// Checkin represents the persisted check-in record. Keep fields small and privacy-safe.
type Checkin struct {
	ID         string     `bson:"_id" json:"id"`
	EventID    string     `bson:"event_id" json:"event_id"`
	TicketID   string     `bson:"ticket_id" json:"ticket_id"`
	TicketHash string     `bson:"ticket_hash" json:"-"` // do not emit
	CheckedIn  bool       `bson:"checked_in" json:"checked_in"`
	CheckedAt  *time.Time `bson:"checked_in_at,omitempty" json:"checked_in_at,omitempty"`
	CreatedAt  time.Time  `bson:"created_at" json:"created_at"`
}
