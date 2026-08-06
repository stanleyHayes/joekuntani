# JK-018 — Production launch checklist

> Status: **BLOCKED** on `UAT-001` DONE + DISC-001 approved content + open ADR closures (004/005/007 as required for claims/money/payments).

## Preconditions

- [ ] UAT-001 signed off
- [ ] DISC-001 missing-asset queue cleared or explicitly deferred with product sign-off
- [ ] ADR-004 payment provider confirmed (or ticketing payments remain unavailable with clear UX)
- [ ] ADR-005 approved biography/assets/claims/contact details imported via CMS (never hardcoded)
- [ ] ADR-007 timezone/currency/tax/refund defaults confirmed

## Launch sequence

1. [ ] Production env groups isolated from staging (Mongo URI, Cloudinary folder, Resend, analytics, secrets)
2. [ ] Preflight: `config.ValidateStartup` dry-run / Render deploy preview
3. [ ] Controlled Mongo change apply+verify on production cluster
4. [ ] Deploy API, confirm `/health/live` (or documented probe)
5. [ ] Deploy web, confirm `/api/health`
6. [ ] Import approved CMS content + redirects
7. [ ] Smoke: public home/services/book/events; admin MFA login; one enquiry; one ticket purchase path if payments configured
8. [ ] Training: operator runbooks (`docs/operations/**`) walked with staff
9. [ ] Post-launch: monitoring/alerts, backup restore note, 24h watch

## Explicit non-goals

Do not invent production biography, clients, metrics, testimonials, or event claims to “finish” this ticket.
