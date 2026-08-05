# SEO and published-slug policy

Public metadata is server-rendered from approved CMS content and global SEO settings. Canonical URLs must use HTTPS and the configured canonical origin; cross-origin CMS values fail closed. Social images are emitted only for ready image assets returned by the safe public-media adapter. Unavailable content is `noindex, nofollow` and omitted from the sitemap.

Published slugs are immutable. A future rename must be handled as an explicit content operation that creates a permanent old-to-new redirect record before the new slug is published. Do not silently mutate a published slug or add an untracked redirect in Next.js configuration. Redirect records must reject chains, loops, external destinations and collisions with live routes, and the deployment smoke test must verify the old URL returns a permanent redirect to the canonical new URL. Until that redirect domain is implemented, editors must retain the existing published slug.
