# Deployment runbook

## Environments

| Environment | Purpose | Isolation rule |
| ----------- | ------- | -------------- |
| local | Developer machines | Disposable MongoDB, placeholder CMS content only |
| preview | Per-PR previews (Vercel web + optional Render API preview) | Distinct env group; never production secrets |
| staging | UAT / release acceptance | Distinct Atlas DB, Cloudinary folder, Resend recipients, analytics project |
| production | Live public site | Distinct secrets and data; CMS/approved import content only |

Never share production MongoDB, Cloudinary folders, Resend recipients, payment webhooks, or analytics projects with staging/preview/local.

## Hosting split

| Surface | Host | Blueprint / project |
| ------- | ---- | ------------------- |
| Next.js public + admin (`apps/web`) | **Vercel** | Import the monorepo; set Root Directory to `apps/web` (or use `pnpm --filter @joe-kuntani/web`) |
| Go REST API (`apps/api`) | **Render** | `render.yaml` service `joe-api` only |

Do not deploy the web app on Render. `render.yaml` intentionally omits `joe-web`.

## Render Blueprint (API)

`render.yaml` defines:

- `joe-api` — Go API service, health `GET /health/live` (readiness: `GET /health/ready`)
- Binds to Render’s injected `PORT` (falls back to `API_ADDR`)

Create separate Render environment groups for staging and production. Preview services inherit PR-scoped values and must not sync production secrets.

### Required Render dashboard values (production)

Set these in the production env group (never commit real secrets):

- `APP_ENV=production`
- `MONGODB_URI` / `MONGODB_DATABASE` (Atlas production DB; no `staging`/`local` markers)
- `PUBLIC_WEB_URL` = exact HTTPS Vercel web origin
- HMAC / session secrets (`MFA_ENCRYPTION_KEY`, `TICKET_TOKEN_HMAC_KEY`, `ENQUIRY_IP_HMAC_KEY`, `CRM_ATTACHMENT_HMAC_KEY`, `SESSION_SECRET`, `CSRF_SECRET`)
- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_WEBHOOK_SECRET`, `CLOUDINARY_FOLDER=joe-kuntani/production`
- Resend: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (`Joe Kuntani <info@joekuntani.com>` — requires the verified `joekuntani.com` domain), `INTERNAL_NOTIFICATION_EMAIL` (`booking@joekuntani.com`)
- `PAYMENT_RETURN_URL` = `{PUBLIC_WEB_URL}/tickets/checkout` (HTTPS)

## Vercel (web)

1. Connect `stanleyHayes/joekuntani` (or the approved remote).
2. Framework: Next.js; install with `pnpm install --frozen-lockfile`; build `pnpm --filter @joe-kuntani/web build`; output from `apps/web`.
3. Set `API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` to the Render API origin.
4. Set `PUBLIC_WEB_URL` to the Vercel HTTPS origin (must match API `PUBLIC_WEB_URL` exactly).
5. Keep staging and production as separate Vercel projects or env targets.

## Pre-deploy checklist

1. Confirm target `APP_ENV` matches the intended Render service/env group.
2. Confirm `MONGODB_DATABASE` and `CLOUDINARY_FOLDER` names encode the environment.
3. Apply controlled MongoDB change scripts (`pnpm test:api:integration` / ApplyAll) against the target database before rolling the API.
4. Confirm Resend domain authentication (SPF/DKIM/DMARC) for the sending domain (or temporary `onboarding@resend.dev` for smoke only).
5. Confirm Vercel custom domain + TLS and www redirect on the web project.
6. Confirm payment webhook endpoints point at the matching API origin.
7. Confirm Sentry/PostHog projects are environment-specific.

## Deploy order

1. Apply MongoDB schema/index changes (backward-compatible).
2. Deploy `joe-api` on Render and wait for `/health/live` and `/health/ready` = 200.
3. Deploy the web app on Vercel and wait for `/api/health` = 200.
4. Run smoke checks in [release-and-rollback.md](release-and-rollback.md).

## Fail-fast configuration

Staging and production API processes refuse to start when required secrets are missing or isolation markers collide. See `apps/api/internal/platform/config`.
