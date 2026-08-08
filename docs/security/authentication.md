# Staff authentication and authorization

JK-003 uses API-issued opaque sessions. Passwords are Argon2id hashes; session and CSRF values are random 256-bit tokens whose database records contain only SHA-256 digests. The browser receives a `HttpOnly`, `Secure`, `SameSite=Strict` session cookie and a separate strict CSRF cookie. Every state-changing authenticated route requires the CSRF cookie value in `X-CSRF-Token`.

Administrators cannot create an authenticated session without a configured TOTP secret and a valid second factor. A successful MFA challenge rotates both session and CSRF values. Authentication failures return generic errors and are rate-limited. Protected handlers authorize permissions server-side; hiding a UI control is never authorization.

Disabling a user updates the account version and revokes all active sessions in one MongoDB transaction. Every login, MFA decision, logout, provisioning, and disable action emits an audit event without credentials, tokens, codes, or personal request data. TOTP secrets are encrypted at rest with AES-256-GCM using the API-only `MFA_ENCRYPTION_KEY`.

## Controlled provisioning

Apply MongoDB changes before provisioning. Generate the encryption key with an approved secret manager; do not commit or paste it into logs. Supply `APP_ENV`, `MONGODB_URI`, `MONGODB_DATABASE`, `MFA_ENCRYPTION_KEY`, `STAFF_NAME`, `STAFF_EMAIL`, `STAFF_PASSWORD`, and `STAFF_ROLE` as process environment values, then run:

```sh
cd apps/api
go run ./cmd/adminuser
```

For administrators, the command generates a unique encrypted TOTP enrollment
secret. It is not read from an environment variable or printed. After password
login, the administrator scans the QR code shown on the MFA page and confirms a
rotating code to finish enrollment. `STAFF_RESET_EXISTING=yes` rotates that
enrollment secret, revokes existing sessions, and starts the same setup flow.

`STAFF_ROLE` is `administrator`, `booking_manager`, `content_editor`, or the optional `analyst`. Administrator provisioning rejects a missing MFA secret. The command prints only the new stable public UUID. Rotate a compromised encryption key through an explicitly reviewed migration; replacing it without re-encrypting existing secrets prevents sign-in by design.

## Permission baseline

| Role               | Admin access      | Content | Operations                                                             | Exports      | User management |
| ------------------ | ----------------- | ------- | ---------------------------------------------------------------------- | ------------ | --------------- |
| Administrator      | Yes, MFA required | Yes     | Full                                                                   | Yes          | Yes             |
| Booking manager    | Yes               | No      | Enquiries, proposals, bookings, contacts, notes, tasks and status only | No           | No              |
| Content editor     | Yes               | Yes     | No                                                                     | No           | No              |
| Analyst (optional) | Yes               | No      | Read-only dashboards                                                   | Reports only | No              |

Future feature slices must call the server authorization layer for their permission and add denial tests. Session expiry is 12 hours; MongoDB removes expired records through the `expires_at` TTL index. No credential recovery flow is enabled until an approved email/provider decision exists.

Authentication POSTs accept only the configured `PUBLIC_WEB_URL` origin (or a Referer with that origin). Production startup rejects non-HTTPS origins or insecure cookies. Session and CSRF cookies are host-only, `SameSite=Strict`, and scoped to `/` so Next `/admin` middleware and same-origin API rewrites receive them; only the session cookie is `HttpOnly` because browser code must echo the CSRF value into `X-CSRF-Token` for authenticated mutations.

Rate-limit identity is the direct peer IP by default. `X-Forwarded-For` is ignored unless the direct peer belongs to an explicitly configured `AUTH_TRUSTED_PROXY_CIDRS` network. The in-process limiter has a fixed 10,000-key ceiling and deterministic least-recently-seen eviction; deployment scaling must preserve gateway limits as an additional layer.
