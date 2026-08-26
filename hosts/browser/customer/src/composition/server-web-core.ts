import 'server-only';

import { nullLogger } from '@pressly/logging';
import {
  nullAnalyticsTracker,
  nullErrorReporter,
} from '@pressly/observability';
import { systemClock } from '@pressly/time';
import { createCustomerWebRuntime } from '@pressly/topology/browser/customer';
import { webEnv } from '@/configuration/env';
import { makeSentryErrorReporter } from '../telemetry/sentry-reporter';
import { makeFetchRequestClient } from '../transport/fetch-request-client';
import { refreshPricing } from '../actions/refresh-pricing';

export type MakeServerWebCoreInput = Readonly<{
  route: string;
}>;

const makeServerContextProvider = (route: string) => ({
  get: () => ({
    source: 'web' as const,
    route,
    sessionId: 'server',
    distinctId: 'server',
  }),
});

export const makeServerWebCore = ({
  route,
}: MakeServerWebCoreInput): ReturnType<typeof createCustomerWebRuntime> => {
  const context = makeServerContextProvider(route);

  const errors =
    webEnv.observability.sentry.dsn === undefined
      ? nullErrorReporter
      : makeSentryErrorReporter();

  return createCustomerWebRuntime({
    clock: systemClock,
    context,
    logger: nullLogger,
    analytics: nullAnalyticsTracker,
    errors,
    request: makeFetchRequestClient({
      baseUrl: webEnv.serverApiBaseUrl,
      getContext: context.get,
      fetch: globalThis.fetch,
    }),
    refreshPricing,
  });
};
