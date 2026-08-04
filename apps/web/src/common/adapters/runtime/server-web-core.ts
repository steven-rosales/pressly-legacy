import 'server-only';

import { nullLogger } from '@pressly/logging';
import {
  nullAnalyticsTracker,
  nullErrorReporter,
} from '@pressly/observability';
import { webEnv } from '@/common/config/env';
import { systemClock } from '@/common/core/runtime/clock';
import { createWebCore, type WebCore } from '@/common/core/runtime/core';
import type {
  ContextProvider,
  WebContext,
} from '@/common/core/runtime/context';
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

  const errors =
    webEnv.observability.sentry.dsn === undefined
      ? nullErrorReporter
      : makeSentryErrorReporter();

  return createWebCore({
    clock: systemClock,
    context,
    logger: nullLogger,
    analytics: nullAnalyticsTracker,
    errors,
    request: makeFetchRequestClient({
      baseUrl: webEnv.serverApiBaseUrl,
      getContext: context.get,
    }),
  });
};
