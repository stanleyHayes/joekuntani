# JK-016 — Cross-app hardening (automatable close)

> Closed for automatable local/CI gates. Staging Lighthouse, pen-test, and live device matrix remain operator residuals under UAT-001.

## Evidence (2026-08-06)

| Gate | Command / proof | Result |
| ---- | --------------- | ------ |
| Payments local return URL | `go test ./internal/payments/ -count=1 -short` — http loopback allowed; non-loopback http rejected | PASS |
| Local API boot | `PAYMENT_RETURN_URL=http://localhost:3000/tickets/checkout` with replica Mongo | PASS |
| Admin login path | `POST /api/admin/auth/login` via Next rewrite → API `200` `{mfa_required:true}` | PASS |
| Stale SW / Inter CSP | `apps/web/public/sw.js` self-unregister + `UnregisterStaleServiceWorker` in Providers (clears foreign localhost:3000 SWs that fetched Google Inter under hostile CSP) | PASS (code) |
| Admin auth UI | Redesigned `/admin/login` + MFA with brand tokens, Outfit display, stage watermarks | PASS (UI) |
| QA-INT | Prior freeze: Mongo 8.0.26 `jk-rs-mongo` `:27027` integration + domain race suites | PASS |
| QA-SEC | `pnpm qa:sec` + `docs/security/hardening-report.md` | PASS |
| QA-E2E / A11Y / PERF | Local public smoke/axe documented; staging Lighthouse / full admin journeys residual | PASS with residual |

## Residuals (not code defects)

1. Staging URL Lighthouse CI + mobile p75 LCP proof (QA-PERF / UAT-001).
2. Staging penetration / dependency CVE operator scan.
3. Full admin + ticketing Playwright journeys once staging fixtures exist.
4. ADR-004 / ADR-005 / ADR-007 business confirmations before production claims.

## Unblock UAT-001

Deploy staging from `JK-017` Blueprint with isolated env groups, then run `docs/operations/uat-checklist.md`.
