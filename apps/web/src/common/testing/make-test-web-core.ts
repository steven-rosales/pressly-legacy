import { invariantViolationError } from '@pressly/errors/factories';
import type { Logger } from '@pressly/logging';
import type { AnalyticsTracker, ErrorReporter } from '@pressly/observability';
import { createWebCore, type WebCore } from '../core/runtime/core';
import type { RequestClient } from '../core/requests/request-client';
import type { Clock } from '../core/runtime/clock';
import type { ContextProvider, WebContext } from '../core/runtime/context';

export type TestWebCore = WebCore & {
  calls: {
    logs: unknown[];
    analytics: unknown[];
    errors: unknown[];
    requests: unknown[];
  };
};

export type MakeTestWebCoreOptions = Readonly<{
  clock?: Clock;
  contextProvider?: ContextProvider<WebContext>;
  logger?: Logger;
  request?: RequestClient;
}>;

export const makeTestWebCore = (
  context: Partial<WebContext> = {},
  options: MakeTestWebCoreOptions = {},
): TestWebCore => {
  const calls = {
    logs: [] as unknown[],
    analytics: [] as unknown[],
    errors: [] as unknown[],
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

  const request: RequestClient = {
    send: async (input) => {
      calls.requests.push(input);
      throw invariantViolationError({
        code: 'web_test_request_client_unconfigured',
        message: 'Request client fake was not configured for this test.',
      });
    },
  };

  const core = createWebCore({
    clock:
      options.clock ??
      ({ now: () => new Date('2026-01-01T00:00:00.000Z') } as const),
    context:
      options.contextProvider ??
      ({
        get: () => ({
          source: 'web',
          route: '/test',
          sessionId: 'session_test',
          distinctId: 'distinct_test',
          ...context,
        }),
      } as const),
    logger: options.logger ?? logger,
    analytics,
    errors,
    request: options.request ?? request,
  });

  return {
    calls,
    ...core,
  };
};
