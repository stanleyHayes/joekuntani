# End-to-end tests

Cross-application Playwright journeys for `QA-E2E`. See `journeys.md` for the Section 18.1 + ticketing matrix.

## Commands

```sh
pnpm exec playwright install chromium   # once per machine
pnpm test:e2e                           # matrix contract + skips without E2E_BASE_URL
E2E_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e
```

Never commit admin passwords or webhook secrets. Prefer staging env groups from `JK-017`.
