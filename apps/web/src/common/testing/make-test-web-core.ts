import type { Logger } from '@pressly/logging';
import type { AnalyticsTracker, ErrorReporter } from '@pressly/metrics';
import type { WebCore } from '../core/runtime/core';
import type { FeedbackPort } from '../core/feedback/feedback';
import type { RequestClient } from '../core/requests/request-client';
import type { WebContext } from '../core/runtime/context';

export type TestWebCore = WebCore & {
  calls: {
    logs: unknown[];
    analytics: unknown[];
    errors: unknown[];
    feedback: unknown[];
    requests: unknown[];
  };
};

export const makeTestWebCore = (
  context: Partial<WebContext> = {},
): TestWebCore => {
  const calls = {
    logs: [] as unknown[],
    analytics: [] as unknown[],
    errors: [] as unknown[],
    feedback: [] as unknown[],
    requests: [] as unknown[],
  };

  const logger: Logger = {
    child: () => logger,
    debug: (message, fields) =>
      calls.logs.push({ level: 'debug', message, fields }),
    info: (message, fields) =>
      calls.logs.push({ level: 'info', message, fields }),
    warn: (message, fields) =>
      calls.logs.push({ level: 'warn', message, fields }),
    error: (message, fields) =>
      calls.logs.push({ level: 'error', message, fields }),
    fatal: (message, fields) =>
      calls.logs.push({ level: 'fatal', message, fields }),
  };

  const analytics: AnalyticsTracker = {
    track: (event, analyticsContext) =>
      calls.analytics.push({ kind: 'track', event, context: analyticsContext }),
    identify: (distinctId, properties) =>
      calls.analytics.push({ kind: 'identify', distinctId, properties }),
    shutdown: async () => undefined,
  };

  const errors: ErrorReporter = {
    capture: (error, errorContext) =>
      calls.errors.push({ error, context: errorContext }),
    shutdown: async () => undefined,
  };

  const feedback: FeedbackPort = {
    loading: (message) => {
      calls.feedback.push({ kind: 'loading', message });
      return 'loading-id';
    },
    success: (message) => calls.feedback.push({ kind: 'success', message }),
    error: (message) => calls.feedback.push({ kind: 'error', message }),
    info: (message) => calls.feedback.push({ kind: 'info', message }),
    dismiss: (id) => calls.feedback.push({ kind: 'dismiss', id }),
  };

  const request: RequestClient = {
    send: async (input) => {
      calls.requests.push(input);
      throw new Error('Request client fake was not configured for this test.');
    },
  };

  return {
    calls,
    clock: {
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    },
    context: {
      get: () => ({
        source: 'web',
        route: '/test',
        sessionId: 'session_test',
        distinctId: 'distinct_test',
        ...context,
      }),
    },
    logger,
    analytics,
    errors,
    feedback,
    request,
  };
};
