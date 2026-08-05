# Content management workspace

`/admin/content` is the unified workflow for pages, portfolio work, videos,
press, testimonials and services. The workspace embeds the existing service
manager without copying service state or mutation logic. The full media library
remains linked for upload and metadata work, while ready assets are selectable
inside the content editor.

The workspace verifies the signed-in role before loading content, service or
media records. Booking managers and analysts receive an accessible denial
surface with no mutation controls. Content editors can create and revise drafts;
only administrators receive enabled
approval, scheduling, publication and unpublication controls. This is an
affordance, not an authorization boundary: every API route repeats RBAC and CSRF
checks, and every accepted mutation is transactionally audited by the content
domain.

Operators can filter by type, status, category, title, slug or tag. The editor
supports categories, tags, featured state, gallery assets, structured results,
kind-specific fields and SEO. Only ready media supplied by the media contract is
offered in the selector. Raw UUID entry remains available for recovery and
advanced workflows. An explicit incomplete-content warning prevents approval or
publication affordances until the minimum editorial fields are present; the
server remains authoritative for validation.

Private preview always uses the authenticated no-store endpoint. Conflicts tell
the operator to reload instead of overwriting another revision. Permission and
validation failures remain generic and do not expose server details. Revision,
last-change time and approval state provide local audit context.

Publication always invokes the concrete workspace refresh adapter after the
authoritative publish, schedule or unpublish mutation succeeds. The adapter
posts the saved content UUID, actual revision, kind, slug, action and exact
derived paths/tags to `/api/admin/cms/cache-invalidation`. That server route
requires an origin that exactly matches the validated `PUBLIC_WEB_URL`, a
matching non-empty CSRF cookie/header and a live administrator session verified
against the API. Missing or malformed public origins fail closed, production
requires HTTPS, and request host or forwarding headers never define the trust
boundary. It rejects unknown or forged fields before calling Next's server-only
`revalidatePath` and immediate `revalidateTag` APIs. A failed revalidation is
surfaced separately and never misreports the already-committed content mutation
as rolled back.
