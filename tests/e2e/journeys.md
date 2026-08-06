# QA-E2E journey matrix (Section 18.1 + ticketing)

Status legend: `SCAFFOLD` (spec exists / skip without stack), `PASS`, `FAIL`, `BLOCKED`.

| ID | Journey | Spec | Status |
| -- | ------- | ---- | ------ |
| E2E-01 | Public home loads with main landmark and incomplete-content safety | `specs/public-smoke.spec.ts` | PASS (local 2026-08-06) |
| E2E-02 | Services empty/approved states remain content-safe | `specs/public-smoke.spec.ts` | PASS (local 2026-08-06) |
| E2E-03 | Enquiry `/book` multi-step surface reachable | `specs/enquiry.spec.ts` | PASS (local 2026-08-06) |
| E2E-04 | Event list/detail discovery | `specs/events-tickets.spec.ts` | SCAFFOLD |
| E2E-05 | Ticket checkout hold → webhook paid → confirmation | `specs/events-tickets.spec.ts` | SCAFFOLD |
| E2E-06 | Sold-out / payment failure releases inventory | `specs/events-tickets.spec.ts` | SCAFFOLD |
| E2E-07 | Check-in once; duplicate rejected | `specs/admin-ops.spec.ts` | SCAFFOLD |
| E2E-08 | Admin role restrictions (editor vs booking vs analyst) | `specs/admin-ops.spec.ts` | SCAFFOLD |
| E2E-09 | CMS publish reflects on public route without deploy | `specs/cms.spec.ts` | SCAFFOLD |
| E2E-10 | Export / audit sensitive actions | `specs/admin-ops.spec.ts` | SCAFFOLD |
| E2E-11 | robots/sitemap do not advertise admin or empty collections | `specs/seo.spec.ts` | PASS (local 2026-08-06) |
| E2E-A11Y | axe serious/critical clean on `/`, `/services`, `/book`, `/events` | `specs/a11y.spec.ts` | PASS (local 2026-08-06) |

## Run

```sh
# Terminal A: API + web against staging or local compose
export E2E_BASE_URL=https://staging.example
export E2E_ADMIN_EMAIL=...
export E2E_ADMIN_PASSWORD=...   # never commit

pnpm test:e2e
```

Without `E2E_BASE_URL` pointing at a live stack, specs skip network assertions and only validate fixture/matrix presence via `specs/matrix-contract.spec.ts`.
