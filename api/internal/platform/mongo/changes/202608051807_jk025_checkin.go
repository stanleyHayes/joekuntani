package changes

import "context"

// Apply202608051807JK025 is a placeholder for the checkin migration used by JK-025.
func Apply202608051807JK025(ctx context.Context, db interface{}) error {
	// TODO: use repository mongo helpers to create `checkins` validators and indexes:
	// - unique index on `ticket_hash`
	// - compound index on `event_id` + `ticket_hash`
	// - partial index on `checked_in_at` for reporting
	return nil
}
