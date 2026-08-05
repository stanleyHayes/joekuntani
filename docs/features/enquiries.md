# Enquiry intake vertical slice

JK-009 provides a five-step `/book` journey driven only by the selected active service's versioned form schema. The browser stores a version-1 draft locally, retains one idempotency key across retries and clears the draft only after a confirmed submission. Every control has a label, keyboard-native semantics, step status, inline errors, a review summary and a reference-only confirmation.

## Server authority and abuse controls

The server repeats all contact, length, consent and service-question validation; unknown answers, injected select values, inactive/retired services and oversized requests fail generically. A honeypot is checked before persistence. A risk assessor decides when CAPTCHA is required; missing or unavailable CAPTCHA verification fails closed. The request IP comes from `X-Forwarded-For` only when the direct peer is an explicitly trusted proxy. Rate limiting uses a keyed HMAC of the normalized IP, stores no raw address and has bounded cardinality.

## Atomic delivery

The idempotency claim, enquiry and exactly two outbox messages (`enquiry.acknowledgement` and `enquiry.internal_alert`) are one transaction. Concurrent use of the same idempotency key returns the original `JK-YYYY-XXXXXX` receipt without duplicate rows. References have a unique index and collision retry budget. Consent stores the authoritative text, version and timestamp.

The outbox worker claims bounded batches, sends through an injected provider, applies exponential backoff and marks exhausted messages dead-lettered for later authenticated admin visibility. Responses, logs and telemetry contain only generic status, the public reference or non-personal service slug—never contact details, answers, raw IP addresses or CAPTCHA tokens.
