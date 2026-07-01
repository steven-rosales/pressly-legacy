import * as Sentry from '@sentry/nextjs';

const sentryTraceSampleRate = Number(
  process.env['NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE'] ?? '0.1',
);
const traceSampleRate =
  Number.isFinite(sentryTraceSampleRate) &&
  sentryTraceSampleRate >= 0 &&
  sentryTraceSampleRate <= 1
    ? sentryTraceSampleRate
    : 0.1;

Sentry.init({
  dsn: process.env['NEXT_PUBLIC_SENTRY_DSN'],
  environment: process.env.NODE_ENV,

  tracesSampleRate: traceSampleRate,

  enableLogs: false,

  sendDefaultPii: false,
});
