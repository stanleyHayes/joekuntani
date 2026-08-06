# Release and rollback

## Release acceptance smoke

After each staging or production deploy, require HTTP 200 from:

- `GET {API_ORIGIN}/health/live`
- `GET {API_ORIGIN}/health/ready`
- `GET {WEB_ORIGIN}/api/health`

Then verify:

1. Public home and one published content route render without hardcoded production claims.
2. Admin sign-in reaches MFA challenge for an administrator.
3. Enquiry submission creates an outbox row (staging recipients only).
4. Ticket checkout against a non-production payment provider remains fail-closed until ADR-004 credentials are approved.

Record evidence in `agent_plan.md` Section 10 for UAT-001 / JK-018.

## Rollback

1. Identify the previous known-good **Render** deploy for `joe-api` and the previous known-good **Vercel** deployment for the web app.
2. Roll back API first if readiness fails; roll back web if only UI regressions appear.
3. Do not reverse MongoDB schema changes unless a tested rollback script exists for that change. Prefer forward fixes that remain backward-compatible.
4. Invalidate CDN/edge caches if the web origin serves stale assets.
5. Confirm the three health probes and admin sign-in after rollback.
6. Open/update an incident note per [incident-response.md](incident-response.md).

## Preview promotions

Pull-request previews must never receive production `MONGODB_URI`, payment webhook secrets, or live Resend audiences. Promote only after staging acceptance.
