# Privacy controls (PRIV-001)

Administrators manage lawful retention and personal-data erasure for Joe’s standalone CRM and enquiry store.

## Consent and source IP

Public enquiry intake (`JK-009`) records:

- versioned consent text and timestamp
- keyed HMAC of the trusted client IP (`source_ip_hash` / `ip_hash`), never the raw address

Settings publish the live consent version label used by `/book` and `/contact`.

## Default retention

Enquiry personal data older than **24 months** since last activity is eligible for anonymization. The retention job:

- anonymizes source enquiry contact fields
- skips contacts with an active legal hold
- audits `privacy.retention.run`

A daily worker and the administrator `POST /api/admin/privacy/retention` endpoint both drive the same service.

## Legal holds

`privacy_holds` stores active holds keyed by CRM contact UUID. While a hold is active:

- CRM `privacy-delete` fails closed with conflict/`ErrRetention`
- retention skips linked enquiries

Place/clear hold actions are administrator-only, CSRF-protected, and audited.

## Personal-data export and delete

CRM already exposes audited privacy export/delete. PRIV-001 adds the lawful-retention gate so deletion cannot proceed under legal hold. Operational identity (enquiry reference/source) is preserved when PII is anonymized.

## Analytics and log redaction

Regression tests assert:

- analytics events reject email/PII properties
- observability JSON logs redact email/secret attributes
