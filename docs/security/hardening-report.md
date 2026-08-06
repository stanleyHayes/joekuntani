# Security hardening report (QA-SEC)

> Generated for `QA-SEC`. Re-run `pnpm qa:sec` after any auth, payment, media, export, or ticketing change.
> Classification: no open critical/high findings from automated suites at freeze time.
> Residual: live Mongo replica integration proofs remain environment-dependent (same class as prior tickets).

## Scope matrix

| Control | Expected behavior | Primary evidence | Result |
| ------- | ----------------- | ---------------- | ------ |
| Auth session + MFA | Opaque digest sessions; MFA required for administrators; CSRF on mutations | `apps/api/internal/auth` HTTP/service tests | PASS |
| Origin defense | Login/MFA reject cross-site / missing Origin | `TestLoginAndMFARejectCrossSiteOrMissingOrigin` | PASS |
| CSRF + rate limit | Double-submit CSRF; bounded proxy-aware limiting | `TestHTTPAuthenticationCSRFAndRateLimit` | PASS |
| RBAC / IDOR | Server-side permission denial; wrong-role forbidden | auth/crm/privacy/media/ticketanalytics denial tests | PASS |
| Enquiry abuse | Honeypot/CAPTCHA/rate-limit fail closed; untrusted proxy ignored | `enquiries` HTTP/service tests | PASS |
| Media upload safety | Signature/host/dimension checks; replay rejected; safe upload DTOs | `media` service/HTTP tests | PASS |
| Payment webhooks | Signed webhook authority; idempotent replay; fail-closed checkout | `payments` unit (+ integration when Mongo URI set) | PASS |
| Ticket token leakage | QR bearer hashed at rest; wrong-event/invalid token denied; privacy-safe analytics | `checkin`, `issuance`, `ticketanalytics` security suites | PASS |
| Privacy / exports | Analyst forbidden where required; redaction; retention holds | `privacy`, `exports`, `audit` packages | PASS |
| XSS / markup breakout | JSON-LD and SEO helpers escape `<` | `apps/web/lib/seo.test.ts`, event metadata tests | PASS |
| CMS origin | Cache invalidation requires exact `PUBLIC_WEB_URL` Origin; forged forwarded headers ignored | CMS-001 adversarial route tests (web) | PASS |
| Production seed | Production seed forbidden before DB access | `platform/mongo/seed` | PASS |

## How to run

```sh
pnpm qa:sec
```

Optional live webhook/inventory integration (requires disposable Mongo replica):

```sh
export MONGODB_INTEGRATION_URI='mongodb://...'
pnpm test:api:integration
cd apps/api && go test -race -count=1 ./internal/payments/... ./internal/ticketing/... ./internal/checkin/...
```

## Open / external items (not QA-SEC code defects)

| Item | Severity | Owner |
| ---- | -------- | ----- |
| ADR-004 payment provider confirmation | Business | Product |
| ADR-005 approved brand/content claims | Business | Content |
| Credential recovery flow deferred | Product | Auth roadmap |
| Operator restore drill residual (JK-017) | Ops | Platform |

## Freeze conclusion

Automated auth, CSRF, origin, RBAC/IDOR, rate-limit, media replay, webhook, ticket-token, privacy/export, and SEO XSS suites pass under `pnpm qa:sec`. No critical/high code findings opened by this gate. Staging penetration / dependency CVE scan remain part of UAT.

## JK-016 addendum (2026-08-06)

- Payment return URL validation now accepts `http` only for loopback hosts (`localhost` / `127.0.0.1` / `::1`) so local API can boot with `PAYMENT_RETURN_URL=http://localhost:3000/...` while non-loopback `http` remains rejected.
- Stale service-worker unregister path added so foreign localhost:3000 SWs cannot force Google Fonts Inter under hostile CSP during admin login.
- See `docs/quality/jk016-hardening.md`.
