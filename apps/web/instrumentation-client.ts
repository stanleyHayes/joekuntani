import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "./lib/monitoring/sentry";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
