package changes

// 202608051807_jk025_checkin.go
// Placeholder migration for JK-025 check-in related validators and indexes.
// Follow the project's MongoDB change registry convention: sortable filename, no overwrite,
// provide apply/verify behavior and, where safe, rollback guidance.

import "context"

func Apply202608051807JK025(ctx context.Context, db interface{}) error {
    // TODO: create collection validators for `checkins` and index on `ticket_hash` (unique),
    // `event_id + ticket_hash` and `checked_in_at` TTL/partial indexes or similar as needed.
    // Implement using the repository's mongo helper utilities so apply/reapply/drift are testable.
    return nil
}
