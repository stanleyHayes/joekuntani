# ADR 0004: Environment and data isolation

- Status: Accepted
- Date: 2026-08-05

## Context

Local, pull-request preview, staging, and production execution must not share personal data, provider side effects, or secrets.

## Decision

Each environment has distinct MongoDB databases/credentials, Cloudinary folders (and preferably subaccounts where available), Resend recipients/domains or safe routing, analytics projects/keys, monitoring environment tags, payment credentials/webhook endpoints, cookie scope, and application secrets. Startup validation fails fast on missing required variables. Production content enters through CMS or an approved import; preview/staging seed records are unmistakable placeholders.

## Consequences

`render.yaml` references environment groups without embedding secret values. Release order is controlled MongoDB changes, API deploy/readiness, web deploy, then smoke/E2E. Backup restoration is tested to an isolated target, never over the live production database.
