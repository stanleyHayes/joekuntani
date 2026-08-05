# Public events

`JK-020` owns `/events`, `/events/[slug]`, and the scheduled homepage event banner consumer.

- The web adapter reads only `GET /api/public/events` and `GET /api/public/events/{slug}` through `API_BASE_URL`, uses `no-store` with a bounded timeout, validates the safe DTO, and fails closed. It never falls back to admin event routes or hardcoded event details.
- The list supports city, event-local calendar date, upcoming/past, and live ticket-state filters. Detail pages expose approved venue/map, timezone, accessibility, age, entry and refund policy content plus live ticket states and capacity remaining.
- Homepage banners render only when an approved featured banner has both schedule timestamps and the current instant is inside the half-open schedule `[starts_at, ends_at)`.
- Checkout links are enabled only when the API reports `on_sale` and provides an internal `/tickets/checkout` URL. Until JK-021/JK-022 mount inventory and checkout, ticket cards remain visible but fail closed to a disabled checkout state.
- Shared integration gap: JK-019 currently mounts protected admin event routes but not the two PDF-required public event reads. The API/OpenAPI owner must expose a published-only safe projection with no internal IDs or draft/cancelled events. This web slice intentionally does not edit shared router, composition, OpenAPI, generated client, or MongoDB files.
