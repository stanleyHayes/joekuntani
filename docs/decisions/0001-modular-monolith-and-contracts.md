# ADR 0001: Modular monolith and API-first contracts

- Status: Accepted
- Date: 2026-08-05

## Context

The product spans public content, staff operations, and event commerce but is a single-tenant v1. The specification requires maintainable domain separation without microservice overhead.

## Decision

Use a pnpm monorepo with a Next.js 16 App Router web service and a Go 1.25+ modular-monolith API. MongoDB Atlas is the operational database. The API exposes versioned REST endpoints described by OpenAPI; the web consumes a generated typed client. Domain packages own their models, services, repositories, and authorization policy. Runtime composition remains explicit.

## Consequences

- One API deployment and database simplify release/operations.
- Package boundaries and contract checks prevent accidental coupling.
- Cross-domain invariants can use explicit application orchestration and MongoDB transactions.
- A future extraction requires measured need and an ADR; no v1 microservices.
