import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';

const sentryDsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];
const posthogKey = process.env['NEXT_PUBLIC_POSTHOG_KEY'];
const posthogHost =
  process.env['NEXT_PUBLIC_POSTHOG_HOST'] ?? 'https://us.i.posthog.com';

if (sentryDsn !== undefined && sentryDsn.length > 0) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env['NODE_ENV'],

    integrations: [Sentry.replayIntegration()],

    tracesSampleRate: 1,
    enableLogs: true,

    replaysSessionSampleRate: 0.1,

    replaysOnErrorSampleRate: 1.0,

    sendDefaultPii: true,

    beforeSend: (event) => {
      delete event.request?.cookies;
      delete event.request?.headers?.['authorization'];
      delete event.request?.headers?.['cookie'];

      return event;
    },
  });
}

if (posthogKey !== undefined && posthogKey.length > 0) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: '2026-01-30',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    request_batching: false,
    internal_or_test_user_hostname: null,
    before_send: (event) => event,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
