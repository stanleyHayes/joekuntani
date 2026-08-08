# Static assets

`brand/` is a copy of the same directory in `apps/web/public/`. Next serves
`public/` from the app's own origin and has no mechanism for serving another
package's files at `/`, so two apps that both render the brand mark each need
their own copy.

It is brand artwork — a logo and four watermark SVGs — that changes rarely. If
you replace one, replace it in both apps.
