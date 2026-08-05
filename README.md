# Joe Kuntani Digital Brand Platform

Standalone public brand, commercial operations, content management, and first-party event ticketing platform for Joe Kuntani.

The authoritative product source is `Joe_Kuntani_Digital_Brand_Platform_AI_Build_Specification_Ticketing_Updated.pdf`. Delivery status, ownership, dependencies, decisions, and verification evidence live in `agent_plan.md`; agents must claim work there before editing implementation files.

## Repository layout

```text
apps/web/          Next.js 16 public website and administration UI
apps/api/          Go 1.25+ modular-monolith REST API
contracts/openapi/ Versioned OpenAPI source and generated-client contract
infra/mongodb/     MongoDB validation, index, and controlled change scripts
tests/e2e/         Cross-application Playwright journeys
docs/              Architecture, decisions, product inventory, and runbooks
scripts/           Reproducible developer and CI entrypoints
```

The application scaffold and quality commands are delivered by `JK-001`. Until that ticket is complete, the directories intentionally contain ownership notes rather than generated application code.

## First-time setup

1. Install the versions documented in `.tool-versions` (or compatible newer patch releases).
2. Copy `.env.example` to `.env.local`; never commit real credentials.
3. Read `agent_plan.md` and claim one `READY` ticket before editing.
4. Follow `docs/development/local-development.md` for local services and verification.

## Product constraints

- Do not invent biography, clients, metrics, testimonials, pricing, events, or contact details.
- Staging placeholders must be conspicuous and must never reach production.
- Ticketing is only for Joe's own events; this is not a marketplace.
- Payment confirmation comes only from verified provider webhooks.
- Personal information must not enter logs, analytics, QR payloads, or public identifiers.

## Ownership

Copyright ownership and licensing terms are pending written confirmation from Neurodyne Corp. No open-source license is granted by this repository unless a future approved `LICENSE` file states otherwise.
