'use client';

import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';
import { usePathname } from 'next/navigation';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  nullErrorReporter,
  nullAnalyticsTracker,
} from '@pressly/observability';
import { nullLogger } from '@pressly/logging';
import { webEnv } from '@/common/config/env';
import { systemClock } from '@/common/core/runtime/clock';
import { createWebCore, type WebCore } from '@/common/core/runtime/core';
import type {
  ContextProvider,
  WebContext,
} from '@/common/core/runtime/context';
import { makeBrowserPostHogTracker } from '../analytics/posthog-tracker';
import { makeSentryErrorReporter } from '../observability/sentry-reporter';
import { makeFetchRequestClient } from '../requests/fetch-request-client';
import { getOrCreateBrowserId } from './browser-ids';

const WebCoreContext = createContext<WebCore | null>(null);

const makeBrowserContextProvider = (
  route: string,
): ContextProvider<WebContext> => {
  const sessionId = getOrCreateBrowserId('pressly:session-id');
  const distinctId = getOrCreateBrowserId('pressly:anonymous-id');

  return {
    get: () => ({
      source: 'web',
      route,
      sessionId,
      distinctId,
    }),
  };
};

const makeUnavailableRequestClient = (): WebCore['request'] => ({
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

    const request = makeFetchRequestClient({
      baseUrl: webEnv.apiBaseUrl,
      getContext: context.get,
    });

    return createWebCore({
      clock: systemClock,
      context,
      logger: nullLogger,
      analytics,
      errors,
      request: request ?? makeUnavailableRequestClient(),
    });
  }, [pathname]);

  return (
    <WebCoreContext.Provider value={core}>{children}</WebCoreContext.Provider>
  );
};

export const useWebCore = (): WebCore => {
  const core = useContext(WebCoreContext);

  if (core === null)
    throw invariantViolationError({
      code: 'web_core_provider_missing',
      message: 'useWebCore must be used inside WebCoreProvider.',
      safeMessage: 'Application runtime is unavailable.',
    });

  return core;
};

/**
 * For testing only.
 */
export const InjectedWebCoreProvider = ({
  core,
  children,
}: PropsWithChildren<{ core: WebCore }>) => (
  <WebCoreContext.Provider value={core}>{children}</WebCoreContext.Provider>
);
