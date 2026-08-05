# System context and modular-monolith boundaries

Status: accepted baseline from specification v1.1  
Date: 2026-08-05

## Purpose

Joe Kuntani's platform combines a public brand site with a private commercial operations system and first-party commerce for Joe's own events. It is one product and one tenant. Version 1 deliberately excludes creator onboarding, a creator marketplace, fan social features, resale, unrelated event organizers, full accounting, payroll, and escrow.

## Runtime topology

```text
Public visitors and staff browsers
                |
      Next.js 16 web service
                |
       Versioned REST/OpenAPI
                |
         Go modular monolith
        /       |       |   \
 MongoDB    Cloudinary Resend Payment provider
  Atlas                            adapter
                |
       PostHog / Sentry signals
```

- Render hosts separate `joe-web` and `joe-api` services.
- MongoDB Atlas, Cloudinary, Resend, analytics, monitoring, and payment resources are isolated by environment.
- The Go API is authoritative for authentication, authorization, domain state, money, inventory, payment confirmation, ticket issuance, check-in, auditing, and server-side conversion records.
- Next.js renders public content and staff workflows. React components contain presentation/orchestration, not authoritative business rules.
- Google Search Console is the planned search-performance/SEO integration. `SEO-001` owns verified property setup, sitemap submission, least-privilege ownership, and environment/domain evidence; it receives no application PII.

## Bounded contexts

| Context           | Owns                                                                                   | Does not own                                                    |
| ----------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Identity & access | Users, roles, MFA, sessions, revocation, authorization decisions                       | Public content or CRM records                                   |
| Settings          | Brand/contact/navigation/SEO/integration/consent configuration                         | Provider secrets exposed to web clients                         |
| Content           | Pages, portfolio, videos, press, testimonials, services, publication lifecycle         | Raw media bytes                                                 |
| Media             | Signed uploads, verified completion, metadata, usage references, private asset access  | Content publication decisions                                   |
| Enquiries         | Dynamic intake, validation, consent, reference/idempotency, lead stages                | Confirmed booking state                                         |
| CRM               | Organizations, contacts, communication history, notes and tasks                        | Authentication identity                                         |
| Bookings          | Calendar entries, tentative/confirmed state, conflict detection and iCal               | Ticket inventory                                                |
| Campaigns         | Campaigns, deliverables, approvals, fees/expenses/results                              | Accounting ledger or settlement truth                           |
| Events            | Event lifecycle, publication/banner schedule, ticket types and sales windows           | Payment settlement                                              |
| Ticket orders     | Atomic inventory holds, order/items, totals, expiry and reconciliation state           | Browser-declared payment success                                |
| Payments          | Vendor-neutral provider adapter, checkout, webhook verification/deduplication, refunds | Provider-specific concepts in domain models                     |
| Tickets/check-in  | Issuance, opaque token hashes, secure retrieval, void/refund state, atomic admission   | Buyer PII inside QR codes                                       |
| Notifications     | Outbox, templates, retries and delivery status                                         | Domain state transitions initiated by email callbacks           |
| Analytics         | Privacy-safe events and aggregates, server conversion truth                            | Names, contact details, free text or confidential campaign data |
| Audit/exports     | Immutable action evidence and role-scoped CSV                                          | General application logging                                     |

Contexts interact through explicit application services and narrow interfaces inside one Go process. Repositories are context-owned; code must not reach into another context's collection directly. Transactions span only invariants that truly require atomicity, especially reservations, payment transitions, ticket issuance, and check-in.

## Data rules

- Internal MongoDB identifiers use ObjectId; exposed identifiers use stable UUID public IDs.
- All timestamps are UTC at rest and displayed in the configured business timezone.
- Money uses Decimal128 and ISO 4217 currency codes.
- Published slugs are unique and immutable unless a redirect is recorded.
- Enquiries, contacts, bookings, and campaigns use soft deletion. Only unreferenced drafts/assets may be hard-deleted.
- Schema validation and indexes are explicit, versioned, backward-compatible controlled changes.
- Sensitive free text is excluded from analytics and structured logs.

## Trust boundaries

| Boundary                          | Required control                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Browser -> web/API                | TLS, input validation, CSRF for cookie-authenticated mutations, rate limiting, secure cookies |
| Staff action -> domain            | Authenticated session, server-side RBAC/ownership, audit for sensitive mutations              |
| API -> MongoDB                    | Least-privilege credentials, environment isolation, validators/indexes, tested backup/restore |
| Browser -> Cloudinary             | Short-lived constrained signed upload issued by API; completion/webhook verification          |
| Provider -> webhook               | Raw-body signature verification, event and payment-reference idempotency, replay safety       |
| Ticket bearer -> lookup/check-in  | Opaque high-entropy token, stored hash, minimal response, atomic state transition             |
| API -> email/analytics/monitoring | Redaction, idempotency/outbox where required, no sensitive free text                          |

## Failure and consistency principles

- Persist business state before attempting non-authoritative notifications; retry email with backoff and expose failures to staff.
- Provider webhook truth outranks browser redirect state.
- An inventory hold is short-lived and conditionally/transactionally reserved; expiration safely releases it.
- A late verified payment enters explicit reconciliation and never silently oversells.
- Duplicate webhooks, retries, and client submissions must return the existing result without duplicating side effects.
- Provider outages preserve drafts/orders in an honest pending/failed state.

## Growth posture

The system is designed for 100k monthly visits and 10k stored enquiries without redesign. Scale web/API instances horizontally only after statelessness, indexes, query evidence, and background-work ownership are correct. Do not split services until measured operational or organizational pressure justifies the distributed-system cost.
