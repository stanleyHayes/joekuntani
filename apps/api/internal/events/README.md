# Events and ticket types

This package owns the administrative event aggregate and ticket-type catalogue.
It does not reserve inventory, create orders, process payments, or expose public
event pages; those remain later ticketing slices.

## Invariants

- Public IDs are immutable UUIDs and event slugs are generated once at creation.
- Event state changes only through `Publish` (`draft` to `published`) and
  `Cancel` (`published` to `cancelled`). Client payloads contain no state field.
- Publishing requires a future event, at least one valid ticket type, and total
  ticket capacity no greater than event capacity.
- Ticket prices are accepted as bounded decimal strings and persisted as MongoDB
  `Decimal128`; currency is an uppercase ISO 4217 code.
- Sold and reserved quantities are server-owned. Capacity can never fall below
  their sum, and transactional capacity allocation prevents concurrent ticket
  types from exceeding the event capacity.
- Sales status is derived from the sales window, pause flag and quantities.
  Pause/resume is available only for published events.
- Featured banners require an approved asset identifier and a bounded schedule
  ending no later than the event.
- Every mutation is authorized by the caller-provided actor and commits its
  audit event in the same store transaction. Preview is staff-authorized and
  must be served with `no-store` by shared route composition.

## Shared integration handoff

The shared integration owner must mount `Handler` behind the event-management
permission and CSRF middleware for mutations, add exact `events` and
`ticket_types` validators/indexes, document the routes in OpenAPI, regenerate
the TypeScript client, and add the admin navigation entry. The package itself
does not modify those shared surfaces while another lane owns their reservation.
