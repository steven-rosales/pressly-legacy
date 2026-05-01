'use client';

import posthog from 'posthog-js';
import type {
  AnalyticsContext,
  AnalyticsTracker,
  ProductEvent,
} from '@pressly/metrics';

const toProperties = (
  event: ProductEvent,
  context: AnalyticsContext | undefined,
): Record<string, unknown> => ({
  ...event.properties,
  schema_version: event.schemaVersion,
  session_id: context?.sessionId,
  request_id: context?.requestId,
  trace_id: context?.traceId,
  route: context?.route,
});

export const makeBrowserPostHogTracker = (
  enabled: boolean,
): AnalyticsTracker => ({
  track: (event, context) =>
    enabled &&
    posthog.capture(event.name, toProperties(event, context), {
      send_instantly: true,
      transport: 'sendBeacon',
    }),
  identify: (distinctId, properties) =>
    enabled && posthog.identify(distinctId, properties),
  shutdown: async () => undefined,
});
