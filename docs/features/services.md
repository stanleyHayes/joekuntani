# Services vertical slice

JK-006 implements approved service content without seeding or hardcoding business claims.

## Lifecycle and identifiers

- A service receives a UUID v4 and a normalized slug when it is created. Both identifiers remain stable when its editable name or content changes.
- Public reads return active services only, ordered by `sort_order`, then name and internal identifier for deterministic ties.
- Staff may create, update, activate, deactivate, reorder and retire services. `DELETE` deliberately performs a soft retirement: the service leaves every public read while its immutable identifiers and referenced history remain available to staff and audits. A retry is idempotent and does not append another audit event.
- Lifecycle is explicit: `active`, `inactive` or `retired`. Retired services are read-only and cannot be edited, activated or reordered.
- Every service starts at version `1`. Update, active-state and reorder commands carry their observed version; retirement uses `If-Match`. Stale writes return `409 Conflict`. Reordering requires the complete non-retired set and the version of every item.
- Every mutation and its audit event is committed in the same MongoDB transaction. A failed audit insert rolls back the content mutation.
- The append-only corrective MongoDB change evolves only the checksum-bound `services` bootstrap collection. It backfills versions before applying an exact top-level validator (`additionalProperties: false`) covering lifecycle/version fields, without disabling verification for unrelated bootstrap collections.

## Form schema

Each service owns a versioned list of at most 30 questions. Question keys are unique machine identifiers. Supported controls are `text`, `textarea`, `select`, `multi_select`, `date`, `number` and `checkbox`; select controls require 2-20 unique options. The API rejects unknown request fields, oversized payloads and invalid schemas.

The contextual CTA is restricted to the internal `/book` route. The public page adds the immutable service slug as the `service` query parameter so JK-009 can select the correct form schema without accepting an arbitrary redirect.

## Authorization and content safety

Public routes cannot read inactive records. Admin routes require the authenticated content-edit permission, CSRF protection and an actor resolved by shared API composition; domain methods repeat the edit authorization check. No production service descriptions are seeded. When no approved records exist, `/services` displays a conspicuous content-awaiting-approval state and a general enquiry link.

## Operations and telemetry

Successful public detail reads emit only `service_viewed` with the non-personal slug through the injected telemetry adapter. API failures return generic problem responses. Logs and analytics do not receive question responses or visitor data.
