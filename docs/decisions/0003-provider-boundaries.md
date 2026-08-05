# ADR 0003: External providers remain adapters

- Status: Accepted boundary; provider selections open
- Date: 2026-08-05

## Context

The specification names Cloudinary, Resend, PostHog, Sentry, and a payment-provider abstraction. Provider outages or replacements must not rewrite product domains or lose authoritative state.

## Decision

- Cloudinary is the planned image/PDF adapter with constrained signed uploads and verified completion.
- Resend is the email adapter behind a durable outbox and idempotent send behavior.
- PostHog is the planned product analytics adapter; the server conversion log remains authoritative.
- Sentry is the planned error-monitoring adapter with PII redaction.
- Payment is defined by `CreateCheckout`, `VerifyWebhook`, `GetPaymentStatus`, and `Refund`; the initial Ghana provider and payment methods remain open under ADR-004 in `agent_plan.md`.
- Risk-triggered bot challenge and malware scanning vendors remain open; interfaces and safe failure behavior precede vendor coupling.

## Consequences

Provider SDK types must not appear in domain entities. Each adapter needs timeouts, bounded retries where safe, idempotency, webhook verification where applicable, observability, and a test fake. Secrets stay in the Go API or deployment secret storage and never enter public bundles.
