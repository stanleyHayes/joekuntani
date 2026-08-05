# ADR 0002: Server-authoritative sessions, authorization, and commerce

- Status: Accepted with implementation detail open
- Date: 2026-08-05

## Context

Staff manage personal data, financial records, content, tickets, and exports. Browser UI restrictions are not a security boundary.

## Decision

The Go API issues and validates staff authentication. Prefer an opaque secure HttpOnly session cookie with server-side session records, rotation, CSRF protection, device/session revocation, and mandatory administrator MFA. If `JK-003` proves a short-lived access plus rotating-refresh design materially safer or simpler for the chosen auth library, it may adopt that design through an ADR while keeping refresh material HttpOnly and server-revocable.

Every protected endpoint performs server-side role/ownership authorization. State transitions are domain methods, not arbitrary client-provided status fields. Payment webhooks alone confirm payments. Ticket lookup uses separate scoped bearer access and QR tokens contain no personal information.

## Consequences

- `JK-003` must document exact cookie, expiry, rotation, MFA recovery and revocation behavior.
- Disabling a user revokes all active sessions.
- Exports and high-risk actions require authorization and audit records.
- Browser success pages remain informational until API state reflects a verified webhook.
