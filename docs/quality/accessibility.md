# Accessibility gate (QA-A11Y)

Target: WCAG 2.2 AA, mobile-first from 320px, visible focus, labels, contrast, `prefers-reduced-motion`.

## Automated evidence (current)

| Check | Command / location | Result |
| ----- | ------------------ | ------ |
| Design-token contrast (selection accents) | `apps/web/app/design-tokens.test.ts` | PASS in unit suite |
| Shell landmarks / skip links | `components/layout/layout.test.tsx` | PASS |
| Reduced-motion theme/motion skips | theme + motion suites; GSAP gated on `prefers-reduced-motion` | PASS |
| Theme toggle name / pressed state | `components/theme/theme-toggle.test.tsx` | PASS |
| Content-incomplete warning semantics | admin shell tests | PASS |

## Automated axe (local evidence 2026-08-06)

```sh
E2E_BASE_URL=http://127.0.0.1:3000 PW_CHANNEL=chrome pnpm exec playwright test --config tests/e2e/playwright.config.ts --project=chromium tests/e2e/specs/a11y.spec.ts
```

Result: **4/4 PASS** — no serious/critical violations on `/`, `/services`, `/book`, `/events` (wcag2a/aa/22aa tags).

## Still required before claiming full WCAG certification

1. axe on admin login + CMS routes (needs auth fixtures).
2. Keyboard-only smoke: skip link, header nav, theme toggle, enquiry steps, admin sidebar.
3. Screen-reader spot check (VoiceOver) on public hero + enquiry confirmation.
4. 320px and 1440px overflow check after brand polish.
