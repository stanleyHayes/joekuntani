# Joe Kuntani admin

Standalone Next.js staff console for `admin.joekuntani.com`.

## Local development

Copy `.env.example` to `.env`, start the API, then run:

```sh
pnpm dev:admin
```

The console runs on `http://localhost:3001`. Its canonical routes are root-level
paths such as `/login`, `/events`, and `/settings`. Legacy `/admin/*` bookmarks
redirect to their clean equivalents.

## Vercel

Create a separate Vercel project from this repository with:

- Root Directory: `apps/admin`
- Framework Preset: Next.js
- Environment variable: `API_BASE_URL` set to the public API origin
- Production domain: `admin.joekuntani.com`

On the API deployment set `PUBLIC_ADMIN_URL=https://admin.joekuntani.com`.
This makes invitations, CRM notifications, attachment downloads, redirects and
origin validation use the standalone console. `PUBLIC_WEB_URL` remains the
public website origin.

All routes declare `noindex`; the admin app is not a public search surface.
