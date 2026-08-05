# Content domain

JK-007 owns editorial lifecycle behavior for `pages`, `portfolio_items`, `videos`, `press_items`, and `testimonials`.

## Lifecycle and authorization

- A content editor may create and update drafts and use the private preview. Editing a scheduled or published record returns it to `draft` and revokes approval.
- Approval and publication require an actor with `CanApprove`; API composition should map this to administrators only. The domain repeats these checks server-side.
- `draft` and `unpublished` records never enter public queries. `scheduled` records become publicly queryable only when `publish_at <= now`, and both scheduled and published records disappear when `unpublish_at <= now`.
- Preview responses are `private, no-store` and `noindex, nofollow`. They are never mounted under public routes.
- Public UUID and slug are generated/set only on create. Updates use the current stored identity and Mongo filters include the immutable slug where applicable. Published or scheduled records cannot be deleted.
- Every create, update, approve, schedule, publish, unpublish, and delete operation is committed in the same MongoDB transaction as its audit event.

## Shared integration

The API composition constructs the Mongo repository, domain, and handler. Public reads are mounted at `GET /api/public/content/{kind}` and `GET /api/public/content/{kind}/{slug}`. Admin reads and preview require authenticated `content:edit`; every mutation additionally requires CSRF, while the domain permits approval and publication only when composition identifies an administrator.

The OpenAPI contract describes every route and five-kind payload, and the generated TypeScript client is kept in drift checks. Change `202608051519_jk007_content` explicitly evolves all five bootstrap collections, preserves equivalent bootstrap index names, and installs exact top-level and nested validators with `additionalProperties: false`.

Required common fields are `public_id`, `title`, `summary`, `tags`, `featured`, `gallery_asset_ids`, nested exact `seo`, `status`, `approved`, nullable `publish_at`, `unpublish_at`, `published_at`, `created_at`, and `updated_at`. `status` is one of `draft`, `scheduled`, `published`, `unpublished`; UUID/asset-ID values are strings matching the repository UUID contract. Page and portfolio additionally require immutable `slug`; portfolio alone stores `results`. Kind-specific fields mirror `model.go`, and a field irrelevant to a kind is rejected rather than silently stored.

Required indexes per collection:

- pages: unique slug; `(approved, status, publish_at, unpublish_at)`.
- portfolio: unique slug; public lifecycle; `(category, featured, publish_at)`; multikey tags.
- videos: unique external URL; public lifecycle; `(category, featured, publish_at)`; multikey tags.
- press: unique external URL; public lifecycle; `(outlet, featured, publish_at)`; multikey tags.
- testimonials: public lifecycle; `(featured, publish_at)`; multikey tags.

Slug redirects are not created because JK-007 slugs are immutable. A future explicitly approved rename feature must create a durable redirect record atomically; it must never rewrite a published slug in place.

## Public and admin surfaces

The public `/`, `/about`, `/work`, `/work/[slug]`, `/videos`, and `/press` routes fetch repository-backed approved content and fail closed to conspicuous incomplete states. No biography, client, metric, testimonial, result, or press claim is hardcoded. `/admin/content` exposes kind-aware draft fields, SEO, tags, galleries, results, private preview, approval, immediate/scheduled publication, scheduled unpublish, and explicit status feedback.

Focused verification:

```sh
cd apps/api && go test -race ./internal/content
pnpm --filter @joe-kuntani/web lint
pnpm --filter @joe-kuntani/web typecheck
pnpm --filter @joe-kuntani/web test
pnpm --filter @joe-kuntani/web build
```
