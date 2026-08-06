# UAT-001 — Staging release acceptance checklist

> Status: **BLOCKED** until a staging deploy exists and an authorized manager signs off.
> Depends on: `JK-016` (automatable hardening closed), `JK-017` (Render/runbooks).

## Preconditions

- [ ] Staging web + API healthy on Render (or equivalent) with isolated Mongo/Cloudinary/Resend/PostHog/Sentry
- [ ] Staging secrets populated (no production secrets)
- [ ] CMS content is placeholder-only unless explicitly approved for staging
- [ ] At least one administrator with MFA enrolled on staging

## Automated

- [ ] `pnpm qa:sec` against staging contracts/config (or CI on staging branch)
- [ ] Playwright public smoke/SEO/enquiry/axe against staging base URL
- [ ] API health live/ready probes green
- [ ] Optional: Lighthouse CI mobile p75 LCP ≤ 2.5s on key public routes

## Manual role matrix

| Role | Must verify |
| ---- | ----------- |
| Editor | CMS draft/publish/preview; media upload; services content |
| Booking manager | Enquiry → CRM stage → booking calendar |
| Ticket ops | Event inventory, order ops, check-in scanner (staging event) |
| Analyst | Dashboards/exports without PII leakage |
| Administrator | MFA login, settings, audit, privacy holds |

## Sign-off

| Item | Owner | Date | Result |
| ---- | ----- | ---- | ------ |
| Defects triaged / P0-P1 closed | — | — | — |
| Authorized manager review | — | — | — |
| Staging uses only approved or marked placeholders | — | — | — |

**Unblock action for agents:** when staging URL + manager sign-off exist, attach evidence in `agent_plan.md` Section 10 and mark `UAT-001` DONE.
