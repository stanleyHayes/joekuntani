import type { Event } from "@sentry/nextjs";

/** Keep routing/error shape while dropping all user-controlled event containers. */
export function scrubSentryEvent<T extends Event>(event: T): T {
  delete event.request;
  delete event.breadcrumbs;
  delete event.contexts;
  delete event.extra;
  delete event.fingerprint;
  delete event.logentry;
  delete event.message;
  delete event.spans;
  delete event.tags;
  if (event.type === "transaction") {
    event.transaction = "[REDACTED]";
  } else {
    delete event.transaction;
  }
  delete event.user;
  if (event.exception?.values) {
    for (const exception of event.exception.values) {
      exception.value = "[REDACTED]";
    }
  }
  return event;
}
