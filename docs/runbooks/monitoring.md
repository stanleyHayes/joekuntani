# Monitoring and alert hooks

## Probes

- API liveness: `GET /health/live`. Restart the process after three consecutive failures.
- API readiness: `GET /health/ready`. Remove the instance from traffic on any non-200 response. Dependency adapters register bounded readiness checks here.
- Web readiness: `GET /api/health`. Monitor externally with caching disabled.

Probe responses deliberately contain no dependency names, errors, environment data, secrets, or PII. External uptime monitors should alert after two consecutive failures and escalate after five minutes. Deployment smoke checks must require all three endpoints to return HTTP 200.

## Logs and errors

The API emits JSON access logs with request ID, method, path, status, and duration. Query strings, bodies, headers, cookies, and client identity are excluded. Sensitive structured keys are replaced with `[REDACTED]`.

Both runtimes initialize Sentry only when a DSN is provided. Default PII collection is disabled and web events remove the request envelope, user-controlled containers, exception messages, breadcrumbs and span content before transmission. Configure `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_APP_ENV`, and `RELEASE_VERSION` through the deployment secret store; never commit values.
