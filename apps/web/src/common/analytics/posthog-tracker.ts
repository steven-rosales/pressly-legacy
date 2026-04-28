'use client';

import posthog from 'posthog-js';
import type {
  AnalyticsContext,
  AnalyticsTracker,
  ProductEvent,
} from '@pressly/metrics';

const anonymousDistinctId = 'anonymous';

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

export const makeBrowserPostHogTracker = (): AnalyticsTracker => ({
  track: (event, context) =>
    posthog.capture(event.name, toProperties(event, context)),
  identify: (distinctId, properties) =>
    posthog.identify(distinctId, properties),
  shutdown: async () => undefined,
});

export const getAnonymousDistinctId = (): string => anonymousDistinctId;
