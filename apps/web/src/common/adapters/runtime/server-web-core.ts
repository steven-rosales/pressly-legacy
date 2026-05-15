import 'server-only';

import { nullLogger } from '@pressly/logging';
import { nullAnalyticsTracker, nullErrorReporter } from '@pressly/metrics';
import { webEnv } from '@/common/config/env';
import { nullFeedback } from '@/common/core/feedback/feedback';
import { systemClock } from '@/common/core/runtime/clock';
import { createWebCore, type WebCore } from '@/common/core/runtime/core';
import type {
  ContextProvider,
  WebContext,
} from '@/common/core/runtime/context';
import { makeConsoleLogger } from '../logging/console-logger';
import { makeSentryErrorReporter } from '../observability/sentry-reporter';
import { makeFetchRequestClient } from '../requests/fetch-request-client';

export type MakeServerWebCoreInput = Readonly<{
  route: string;
}>;

const makeServerContextProvider = (
  route: string,
): ContextProvider<WebContext> => ({
  get: () => ({
    source: 'web',
    route,
    sessionId: 'server',
    distinctId: 'server',
  }),
});

export const makeServerWebCore = ({
  route,
}: MakeServerWebCoreInput): WebCore => {
  const context = makeServerContextProvider(route);

  const logger =
    webEnv.nodeEnv === 'test'
      ? nullLogger
      : makeConsoleLogger({ source: 'web', route, runtime: 'server' });

  const errors =
    webEnv.observability.sentry.dsn === undefined
      ? nullErrorReporter
      : makeSentryErrorReporter();

  return createWebCore({
    clock: systemClock,
    context,
    logger,
    analytics: nullAnalyticsTracker,
    errors,
    feedback: nullFeedback,
    request: makeFetchRequestClient({
      baseUrl: webEnv.serverApiBaseUrl,
      getContext: context.get,
    }),
  });
};
