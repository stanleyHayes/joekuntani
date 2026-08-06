#!/usr/bin/env bash
# QA-SEC: focused security suites (auth, abuse, media, payments, tickets, privacy, SEO XSS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Go security-focused packages"
cd apps/api
go test -race -count=1 \
  ./internal/auth/... \
  ./internal/enquiries/... \
  ./internal/media/... \
  ./internal/payments/... \
  ./internal/issuance/... \
  ./internal/checkin/... \
  ./internal/ticketops/... \
  ./internal/ticketanalytics/... \
  ./internal/privacy/... \
  ./internal/exports/... \
  ./internal/audit/... \
  ./internal/crm/... \
  ./internal/platform/mongo/seed/...

echo "==> Web SEO / CMS origin / XSS-adjacent suites"
cd "$ROOT/apps/web"
pnpm exec vitest run \
  lib/seo.test.ts \
  app/seo-routes.test.ts \
  app/events/metadata.test.tsx \
  components/admin/content/cms-workspace.test.tsx \
  components/admin/content/content-manager.test.tsx \
  components/admin/auth

echo "==> QA-SEC suites passed"
