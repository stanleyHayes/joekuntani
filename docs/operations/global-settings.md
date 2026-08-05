# Global settings lifecycle

Global settings are stored in the versioned `global_settings` collection. The
generic bootstrap `site_settings` collection is intentionally left unchanged so
historical schema changes remain independently verifiable.

## Editing and publication

- Administrators can create and edit every section, mark a draft complete, and
  publish it. Publication copies the validated draft to an immutable snapshot
  within the current version.
- Content editors can edit navigation, footer links, CTAs, public contact and
  social details, brand copy, SEO defaults, and consent copy. Integration and
  team fields are removed from their read response and preserved server-side on
  update. Booking managers and analysts have no settings access.
- Every write includes the expected version. A stale version returns `409` and
  never overwrites a newer draft.
- Draft updates and publication are committed in a MongoDB transaction with the
  corresponding audit event. A failed audit therefore rolls back the settings
  write.

The public endpoint reads only the latest `published` snapshot and projects a
type that cannot contain integration or team fields. Until an administrator
marks the draft complete and publishes it, the endpoint returns `404`; the web
shell retains its explicit content-awaiting-approval fallback.

## Integration secrets

Provider names are editable settings. Credentials remain server environment
variables. The admin API returns only `*_configured` booleans derived from the
environment, and unknown request fields such as `api_key` are rejected. Never
place credentials, tokens, webhook secrets, or DSNs in a settings draft.

## Rollout and recovery

Run controlled Mongo changes before deploying the API. The change
`202608051430_jk005_global_settings` creates and verifies the collection and its
indexes without modifying the historical bootstrap schema. The append-only
`202608051447_jk005_exact_global_settings` evolution supersedes that shallow
validator with exact nested required fields, types, list limits and stable UUID
asset references. The change runner retains and checksum-checks the earlier
record while the newest validator owns current-state drift verification.

Rollback the API if deployment fails; the collection evolution is
backward-compatible with settings written through the service and should not be
dropped. A mistaken publication is recovered by correcting the draft and
publishing a new audited version.
