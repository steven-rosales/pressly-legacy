import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';

const sentryDsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];
const sentryTraceSampleRate = Number(
  process.env['NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE'] ?? '0.1',
);
const posthogKey = process.env['NEXT_PUBLIC_POSTHOG_KEY'];
const posthogHost =
  process.env['NEXT_PUBLIC_POSTHOG_HOST'] ?? 'https://us.i.posthog.com';
const traceSampleRate =
  Number.isFinite(sentryTraceSampleRate) &&
  sentryTraceSampleRate >= 0 &&
  sentryTraceSampleRate <= 1
    ? sentryTraceSampleRate
    : 0.1;

if (sentryDsn !== undefined && sentryDsn.length > 0) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env['NODE_ENV'],

    tracesSampleRate: traceSampleRate,
    enableLogs: false,
    sendDefaultPii: false,

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
