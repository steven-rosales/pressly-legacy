import { createControlBrowserApplication } from '@pressly/topology/browser';
import {
  startControlBrowserHost,
  type ControlBrowserEnvironment,
} from './control-browser-host.ts';
import {
  initializeControlObservability,
  observeControlUnexpectedError,
} from './control-observability.ts';
import './index.css';
import { makeControlBrowserCapabilities } from './control-browser-capabilities.ts';
import { makeControlHttpClient } from './runtime/control-http-client.ts';

const environment = {
  document,
  history: window.history,
  location: window.location,
  storage: window.localStorage,
  events: window,
} satisfies ControlBrowserEnvironment;
const browser = makeControlBrowserCapabilities({
  window,
  document,
  navigator,
  crypto: globalThis.crypto,
});

const observabilityEnabled = initializeControlObservability({
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

const lifecycle = startControlBrowserHost({
  rootId: 'root',
  strictMode: true,
  environment,
  initialize: () =>
    createControlBrowserApplication({
      browser,
      client: makeControlHttpClient({
        apiBaseUrl: import.meta.env.VITE_API_URL ?? '/api',
        fetchImplementation: globalThis.fetch,
      }),
      idempotencyKey: browser.ids.next,
      reportUnexpectedError: (error, context) =>
        observeControlUnexpectedError(error, context, observabilityEnabled),
    }),
  observeFailure: ({ error }) => globalThis.reportError?.(error),
});

if (import.meta.hot !== undefined) import.meta.hot.dispose(lifecycle.dispose);
