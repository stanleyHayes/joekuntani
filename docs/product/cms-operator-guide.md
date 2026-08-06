# CMS operator guide — updating the marketing website

The marketing site is already CMS-backed. Editors do **not** need a code deploy to change approved public content. Invented biography, clients, metrics, or contact details remain forbidden; only approved CMS/settings values are published.

## Where to edit

| Marketing surface | Admin workspace | Notes |
| ----------------- | --------------- | ----- |
| Home / about / legal pages | `/admin/content` → **Pages** | Draft → approval → publish/schedule/unpublish |
| Selected work | `/admin/content` → **Portfolio** | Immutable published slugs (see SEO slug policy) |
| Videos | `/admin/content` → **Videos** | Publication-gated public routes |
| Press | `/admin/content` → **Press** | Publication-gated |
| Testimonials | `/admin/content` → **Testimonials** | Featured items can appear on home when published |
| Services + enquiry schema | `/admin/content` → **Services** (or `/admin/services`) | Soft-retire preserves history |
| Brand, nav, footer, SEO defaults, consent | `/admin/settings` | Draft/publish global settings |
| Images / PDFs / media kit assets | `/admin/media` | Ready + approved assets only surface publicly |
| Events / tickets | `/admin/events` | Separate from content kinds; still CMS-managed data |

Unified content + services live under `/admin/content` (`CMSWorkspace`). Roles: `administrator` or `content_editor` only.

## Publish workflow (content)

1. Sign in with MFA (administrators) / staff session.
2. Open `/admin/content`, choose the content kind.
3. Create or edit a draft (editing a published item returns it to review).
4. Request approval when ready (`content_editor` / `administrator` per RBAC).
5. Publish immediately or schedule `publish_at` / `unpublish_at`.
6. Use **Preview** for private preview URLs before going live.
7. Cache invalidation runs through the authenticated CMS route against the exact configured `PUBLIC_WEB_URL` origin (forged forwarded hosts are ignored).

## SEO after content changes

- Titles/descriptions/social images come from CMS fields + global SEO settings (`SEO-001`).
- Empty collections stay `noindex` and out of the sitemap until published items exist.
- Do not rename published slugs without an explicit redirect record (see `docs/seo-and-slug-redirects.md`).
- After publish, spot-check `/robots.txt`, `/sitemap.xml`, and the page’s canonical/Open Graph tags on staging.

## Content-incomplete warning

Admin shells show a blocking **Content incomplete** warning until DISC-001 missing assets/approvals are satisfied. Staging may show placeholders; production launch (`JK-018`) requires approved imports only.

## What is not in this CMS

| Concern | Status |
| ------- | ------ |
| Payment provider / live checkout | Open `ADR-004` |
| Final brand palette/type approval | Open `ADR-005` (logo-derived tokens are provisional) |
| Production biography/claims import | `JK-018` + DISC-001 |
| Redirect domain for slug renames | Documented policy; implement before renaming live slugs |

## Verification checklist for editors

- [ ] Draft saved with approved copy only
- [ ] Media assets ready, alt text present, HTTPS public URL
- [ ] Approval + publish completed
- [ ] Public route shows new content (hard refresh / cache invalidate)
- [ ] Unavailable/legal pages remain fail-closed until inventories complete
- [ ] No hardcoded marketing claims added in application code
