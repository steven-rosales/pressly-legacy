'use client';

import {
  customerWebClient,
  createCustomerWebClientRuntime,
} from '@pressly/topology/browser/customer-client';
import { invariantViolationError } from '@pressly/errors/factories';
import { nullLogger } from '@pressly/logging';
import {
  nullAnalyticsTracker,
  nullErrorReporter,
} from '@pressly/observability';
import { systemClock } from '@pressly/time';
import { usePathname } from 'next/navigation';
import { useMemo, type PropsWithChildren } from 'react';
import { webEnv } from '@/configuration/env';
import { makeBrowserPostHogTracker } from '../telemetry/posthog-tracker';
import { makeSentryErrorReporter } from '../telemetry/sentry-reporter';
import { makeFetchRequestClient } from '../transport/fetch-request-client';
import { getOrCreateBrowserId } from './browser-ids';
import { refreshPricing } from '../actions/refresh-pricing';

const makeBrowserContextProvider = (route: string) => {
  const sessionId = getOrCreateBrowserId('pressly:session-id');
  const distinctId = getOrCreateBrowserId('pressly:anonymous-id');
  return {
    get: () => ({ source: 'web' as const, route, sessionId, distinctId }),
  };
};

const makeUnavailableRequestClient = (): ReturnType<
  typeof createCustomerWebClientRuntime
>['request'] => ({
  send: async () => {
    throw invariantViolationError({
      code: 'web_core_request_client_unavailable',
      message: 'WebCore request client is unavailable.',
      safeMessage: 'Application runtime is unavailable.',
    });
  },
});

export const WebCoreProvider = ({ children }: PropsWithChildren) => {
  const pathname = usePathname();
  const core = useMemo(() => {
    const route = pathname ?? 'unknown';
    const context = makeBrowserContextProvider(route);
    const analytics =
      webEnv.analyticsEnabled && webEnv.observability.posthog.key !== undefined
        ? makeBrowserPostHogTracker(true)
        : nullAnalyticsTracker;
    const errors =
      webEnv.observability.sentry.dsn === undefined
        ? nullErrorReporter
        : makeSentryErrorReporter();

    return createCustomerWebClientRuntime({
      clock: systemClock,
      context,
      logger: nullLogger,
      analytics,
      errors,
      request:
        makeFetchRequestClient({
          baseUrl: webEnv.apiBaseUrl,
          getContext: context.get,
          fetch: globalThis.fetch,
        }) ?? makeUnavailableRequestClient(),
      refreshPricing,
    });
  }, [pathname]);

  return (
    <customerWebClient.Provider core={core}>
      {children}
    </customerWebClient.Provider>
  );
};
