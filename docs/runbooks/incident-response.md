# Incident response

## Severity

| Level | Example | Response |
| ----- | ------- | -------- |
| SEV-1 | Site down, payment/ticket oversell risk, auth outage | Immediate page; rollback or traffic shed |
| SEV-2 | Degraded enquiry/email delivery, elevated 5xx | Mitigate within 1 hour |
| SEV-3 | Non-urgent observability or content defects | Next business day |

## Immediate actions

1. Check [Monitoring](monitoring.md) probes and Sentry for the affected environment.
2. Preserve request IDs from API JSON logs; do not collect PII from payloads.
3. Prefer Render rollback for bad deploys; prefer feature flags/config for provider outages.
4. For inventory/payment anomalies, stop ticket sales by unpublishing the event and escalate to ticketing owners (`JK-021`–`JK-025` domains).
5. Communicate status to the authorized operations contact; do not invent public statements.

## Post-incident

1. Timeline, root cause, blast radius, and corrective actions.
2. Add automated coverage when a defect is reproducible.
3. Update this runbook if the procedure changed.
