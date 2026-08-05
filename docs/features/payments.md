# Provider-neutral ticket payments

JK-022 keeps the production provider decision open. `PaymentProvider` defines checkout creation, raw signed-webhook verification, status lookup and refunds; the repository and HTTP layers contain no vendor SDK types. `FakeProvider` is deterministic test infrastructure only. Runtime composition remains fail-closed with `UnavailableProvider` until ADR-004 selects and configures a production adapter; provider secrets stay in the Go process.

Checkout possession is proven by the original high-entropy order idempotency key in the `Order-Access-Key` header. Only an active, unexpired held order can create or replay a credential-free HTTPS checkout session. The browser never receives provider secrets and rejects malformed, expired, HTTP or credentialed redirect URLs.

Provider webhooks are the sole authority for `paid`. Signatures cover the exact raw body before parsing. `(provider, external_event_id)` is unique, and webhook persistence, inventory movement, order status and privacy-safe audit are one MongoDB transaction. Success converts reserved units to sold units; failure releases reserved units. A late success restores capacity only when every line remains available, otherwise the order becomes `reconciliation_required` without overselling. Browser redirects never mark an order paid.

The append-only JK-022 schema evolution supersedes JK-021 verification for `ticket_orders`, retains exact `ticket_order_items`, and exactly validates/indexes `payment_webhooks`. Production activation requires an ADR-004 provider adapter, secret rotation/runbook and live provider sandbox evidence; these are intentionally not invented.
