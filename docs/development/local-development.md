# Local development

## Prerequisites

- Node.js, pnpm, and Go versions from `.tool-versions`
- Git
- MongoDB 8 locally or an isolated non-production Atlas database

Cloudinary, Resend, PostHog, Sentry, and payment-provider credentials are optional until their owning slices are implemented. Provider failures must retain a safe local/outbox state rather than lose business data.

## Environment setup

Copy `.env.example` to `.env.local` and replace placeholder secrets. Use a distinct database, media folder, email recipient set, and analytics project for every environment. Never point local or staging execution at production resources.

The checked-in example documents variable names only. Secrets must stay in local files, CI secret storage, or Render environment groups.

## Agent workflow

1. Re-read `agent_plan.md` and current repository status.
2. Claim one unblocked `READY` ticket and reserve shared paths before editing.
3. Keep changes within the ticket's exclusive paths.
4. Run the ticket-specific and affected repository quality gates.
5. Record results in the verification ledger and move work to `IN REVIEW`.
6. A different agent reviews before marking the ticket `DONE`.

## Commands

```bash
pnpm install --frozen-lockfile  # install JavaScript dependencies
pnpm dev                       # run the Next.js development server
cd apps/api && go run ./cmd/api # run the API on API_ADDR (default :8080)
pnpm contracts:check           # lint OpenAPI and detect generated type drift
pnpm test                      # web and race-enabled Go tests
MONGODB_INTEGRATION_URI=mongodb://127.0.0.1:27017 pnpm test:api:integration
pnpm check                     # complete gate, including gofmt/vet/staticcheck
```

The API exposes `/health/live` and `/health/ready`. Readiness currently proves the process baseline only; infrastructure slices must add dependency checks without leaking secret configuration.
