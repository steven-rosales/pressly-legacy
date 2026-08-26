import { createProcessorBrowserApplication } from '@pressly/topology/browser';
import {
  startProcessorBrowserHost,
  type ProcessorBrowserEnvironment,
} from './processor-browser-host.ts';
import { wrapProcessorBrowserRoot } from './processor-error-boundary.tsx';
import {
  initializeProcessorObservability,
  observeProcessorRequestFailure,
  observeProductionConnectionState,
} from './processor-observability.ts';
import './index.css';
import { makeProcessorBrowserCapabilities } from './processor-browser-capabilities.ts';
import { makeBrowserLocationPreferenceAdapter } from './runtime/browser-location-preference.adapter.ts';
import { makeBrowserProductionChangeAdapter } from './runtime/browser-production-change.adapter.ts';
import { makeFetchRequestAdapter } from './runtime/fetch-request.adapter.ts';
import { makeWebCryptoIdempotencyAdapter } from './runtime/web-crypto-idempotency.adapter.ts';

const environment = {
  document,
  history: window.history,
  location: window.location,
  storage: window.localStorage,
  events: window,
} satisfies ProcessorBrowserEnvironment;

const browser = makeProcessorBrowserCapabilities({
  window,
  document,
  navigator,
});

initializeProcessorObservability({
  ...(import.meta.env.VITE_SENTRY_DSN === undefined
    ? {}
    : { dsn: import.meta.env.VITE_SENTRY_DSN }),
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
  ...(import.meta.env.VITE_SENTRY_RELEASE === undefined
    ? {}
    : { release: import.meta.env.VITE_SENTRY_RELEASE }),
  ...(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE === undefined
    ? {}
    : { tracesSampleRate: import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE }),
});

const lifecycle = startProcessorBrowserHost({
  rootId: 'root',
  strictMode: true,
  environment,
  initialize: () =>
    createProcessorBrowserApplication({
      browser,
      effects: {
        makeRequest: (input) =>
          makeFetchRequestAdapter({
            ...input,
            baseUrl: import.meta.env.VITE_API_URL ?? '/api',
            fetch: globalThis.fetch,
          }),
        makeProductionChanges: (describeSubscription) =>
          makeBrowserProductionChangeAdapter({
            apiBaseUrl: import.meta.env.VITE_API_URL ?? '/api',
            describeSubscription,
            eventSourceFactory: (url, options) => new EventSource(url, options),
          }),
        locationPreference: makeBrowserLocationPreferenceAdapter(
          browser.storage,
        ),
        idempotency: makeWebCryptoIdempotencyAdapter(globalThis.crypto),
        now: browser.clock.now,
        observeRequestFailure: observeProcessorRequestFailure,
        observeConnectionState: observeProductionConnectionState,
      },
      wrapRoot: wrapProcessorBrowserRoot,
    }),
  observeFailure: ({ error }) => globalThis.reportError?.(error),
});

if (import.meta.hot !== undefined) import.meta.hot.dispose(lifecycle.dispose);
