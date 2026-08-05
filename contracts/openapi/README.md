# API contracts

`openapi.yaml` is the versioned API source. `pnpm contracts:check` lints it, regenerates TypeScript declarations, and fails when generated output drifts. Contract changes require an active shared-file reservation in `agent_plan.md`.
