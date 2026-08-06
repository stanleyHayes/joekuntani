# Performance gate (QA-PERF)

Target: mobile p75 LCP ≤ 2.5s on key marketing routes; minimal third parties.

## Current controls

- Next.js App Router server rendering for public content.
- Fonts via `next/font` (Syne, DM Sans) with `display: swap`.
- Theme FOUC avoided with inline boot script (no flash layout thrash beyond one attribute set).
- GSAP animations respect `prefers-reduced-motion` and are client-only.
- Public media gated to ready HTTPS assets (no unbounded remote HTML embeds).

## Required evidence for DONE

```sh
# Against staging or local production build:
pnpm --filter @joe-kuntani/web build && pnpm --filter @joe-kuntani/web start
# Then Lighthouse CI (mobile) on /, /services, /events, /book
```

Record LCP/CLS/INP and third-party script count. Ticket concurrency/load suites for holds/webhooks remain in Go race/integration packages under ticketing.

## Residual

Full Lighthouse CI wiring belongs in `.github/workflows` once staging URL is stable (`JK-017` / `UAT-001`).
