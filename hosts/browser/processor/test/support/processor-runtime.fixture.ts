import {
  makeProcessorRuntime,
  processorBrowserOperationBindings,
  type ProcessorBrowserHostEffects,
  type ProcessorConnectionStateObserver,
  type ProcessorRequestFailureObserver,
} from '@pressly/generated-runtime/browser/processor';
import { makeBrowserLocationPreferenceAdapter } from '../../src/runtime/browser-location-preference.adapter.ts';
import {
  makeBrowserProductionChangeAdapter,
  type EventSourceFactory,
} from '../../src/runtime/browser-production-change.adapter.ts';
import { makeFetchRequestAdapter } from '../../src/runtime/fetch-request.adapter.ts';
import { makeWebCryptoIdempotencyAdapter } from '../../src/runtime/web-crypto-idempotency.adapter.ts';

export const makeProcessorRuntimeFixture = (input: {
  apiBaseUrl: string;
  storage: Parameters<typeof makeBrowserLocationPreferenceAdapter>[0];
  fetch: typeof globalThis.fetch;
  crypto: Crypto;
  eventSourceFactory?: EventSourceFactory;
  now: ProcessorBrowserHostEffects['now'];
  observeRequestFailure: ProcessorRequestFailureObserver;
  observeConnectionState: ProcessorConnectionStateObserver;
}) =>
  makeProcessorRuntime({
    operations: processorBrowserOperationBindings,
    effects: {
      makeRequest: (callbacks) =>
        makeFetchRequestAdapter({
          ...callbacks,
          baseUrl: input.apiBaseUrl,
          fetch: input.fetch,
        }),
      makeProductionChanges: (describeSubscription) =>
        makeBrowserProductionChangeAdapter({
          apiBaseUrl: input.apiBaseUrl,
          describeSubscription,
          ...(input.eventSourceFactory === undefined
            ? {}
            : { eventSourceFactory: input.eventSourceFactory }),
        }),
      locationPreference: makeBrowserLocationPreferenceAdapter(input.storage),
      idempotency: makeWebCryptoIdempotencyAdapter(input.crypto),
      now: input.now,
      observeRequestFailure: input.observeRequestFailure,
      observeConnectionState: input.observeConnectionState,
    },
  });
