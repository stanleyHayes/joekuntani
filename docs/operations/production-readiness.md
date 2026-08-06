# Production readiness checklist (PROD-READY-001)

Single checklist before UAT/launch. Update row states with evidence; do not mark PASS without commands or named approvals.

| Area | Gate | State | Evidence / blocker |
| ---- | ---- | ----- | ------------------ |
| CMS for marketing updates | `CMS-001` + `CMS-OPS-001` | PASS (platform) | `/admin/content`, services, media, settings; operator guide in `docs/product/cms-operator-guide.md` |
| SEO | `SEO-001` | PASS (platform) | Metadata, robots, sitemap, structured data; `docs/seo-and-slug-redirects.md` |
| Security automated | `QA-SEC` | PASS (automated) | `pnpm qa:sec` green 2026-08-05; `docs/security/hardening-report.md` |
| Unit tests | `QA-UNIT` | PASS | Go `./...` + web coverage thresholds |
| Integration (Mongo) | `QA-INT` | BLOCKED | Docker/Mongo hang on this host; CI mongo job remains authority |
| E2E journeys | `QA-E2E` | PARTIAL | Public smoke/SEO/enquiry/axe PASS locally; ticketing/admin scaffold |
| Accessibility | `QA-A11Y` | PARTIAL | axe public routes PASS; admin/keyboard residual |
| Performance | `QA-PERF` | PARTIAL | Controls documented; Lighthouse CI residual |
| Deploy foundation | `JK-017` | PASS (residual restore drill) | Render Blueprint, env isolation, runbooks |
| Cross-app hardening | `JK-016` | BLOCKED | Depends on remaining QA-* |
| Staging UAT | `UAT-001` | BLOCKED | Depends on `JK-016` |
| Approved content import | `JK-018` / DISC-001 | BLOCKED | External content approvals |
| Payment provider | `ADR-004` | OPEN | Business confirmation |
| Brand/content claims | `ADR-005` | OPEN | Business confirmation |
| Timezone/currency/fees | `ADR-007` | OPEN | Business confirmation |

## Definition of “production ready” for this platform

1. All `QA-*` and `JK-016` PASS with recorded evidence.
2. Staging UAT (`UAT-001`) signed off with placeholders only where explicitly marked.
3. DISC-001 P0 assets approved and imported (`JK-018`).
4. Open ADRs that affect money, brand, or fees closed or explicitly waived in writing.
5. `pnpm qa:sec` green on the release commit; no open critical/high findings.

Until rows above leave BLOCKED/OPEN, the product may ship to **staging** with incomplete-content warnings, but not claim production launch.
