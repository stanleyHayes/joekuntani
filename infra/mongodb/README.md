# MongoDB controlled changes

MongoDB validators and indexes are source-controlled in the Go API under `internal/platform/mongo/changes`. Reserve every change filename in `agent_plan.md` before creation.

Apply and verify all pending changes with isolated environment variables:

```bash
cd apps/api
APP_ENV=staging MONGODB_URI='...' MONGODB_DATABASE='...' go run ./cmd/mongochange
```

The runner records a checksum in `schema_changes`, refuses changed source for an already-applied entry, applies validators to new/existing collections, creates named indexes idempotently, and verifies required collections/indexes before recording success. Changes must be backward-compatible. Restore tests and production execution are release activities, not local-unit evidence.

The seed registry is empty by default and refuses unknown/production environments. Feature slices may add only clearly labelled non-sensitive local/preview/staging placeholders.
