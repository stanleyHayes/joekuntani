import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "./lib/monitoring/sentry";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.APP_ENV ?? "development",
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
});
