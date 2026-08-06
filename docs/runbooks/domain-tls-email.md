# Domain, TLS, and email authentication

## Custom domains

1. Attach the approved apex and `www` hostnames to the **Vercel** web project (not Render).
2. Enforce HTTPS/TLS certificates managed by Vercel.
3. Redirect `www` ↔ apex according to the approved canonical host in global settings / SEO controls.
4. Attach the API hostname to the Render `joe-api` service and set `API_BASE_URL` / `PUBLIC_WEB_URL` pairing so the Vercel origin and Render API agree exactly.

## Resend authentication

For each sending domain used by an environment:

1. Publish SPF, DKIM, and DMARC records required by Resend.
2. Verify domain status in Resend before enabling customer-facing mail.
3. Keep staging recipients on a safe allowlist; never share production audiences with staging.
4. Until a brand domain is verified, local/smoke mail may use Resend’s `onboarding@resend.dev` sender; replace before launch.

## Monitoring hooks

Configure external uptime checks for web `/api/health` (Vercel) and API `/health/live` + `/health/ready` (Render) per [monitoring.md](monitoring.md). Alert after two consecutive failures; escalate after five minutes.
