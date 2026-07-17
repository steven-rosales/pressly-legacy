import { makeFetchRequestAdapter } from "@/adapters/api/fetch-request.adapter"
import { makeApiAuthenticationAdapter } from "@/adapters/authentication/api-authentication.adapter"
import { makeBrowserLocationPreferenceAdapter } from "@/adapters/location/browser-location-preference.adapter"
import { makeWebCryptoIdempotencyAdapter } from "@/adapters/idempotency/web-crypto-idempotency.adapter"
import { makeApiProductionAdapter } from "@/adapters/production/api-production.adapter"
import {
  makeBrowserProductionChangeAdapter,
  type EventSourceFactory,
} from "@/adapters/production/browser-production-change.adapter"
import type { AuthenticationPort } from "@/ports/authentication.port"
import type { LocationPreferencePort } from "@/ports/location-preference.port"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type { ProductionPort } from "@/ports/production.port"
import type { ProductionChangePort } from "@/ports/production-change.port"
import { initializeProcessorLocalization } from "./localization/localization.composition"
import { observeProcessorRequestFailure } from "./processor-observability"

export type ProcessorRuntime = Readonly<{
  authentication: AuthenticationPort
  production: ProductionPort
  productionChanges: ProductionChangePort
  locationPreference: LocationPreferencePort
  idempotency: IdempotencyPort
  subscribeToUnauthorized: (listener: () => void) => () => void
  now: () => Date
}>

export const makeProcessorRuntime = (input: {
  apiBaseUrl: string
  storage: Storage
  fetch?: typeof globalThis.fetch
  eventSourceFactory?: EventSourceFactory
  now?: () => Date
}): ProcessorRuntime => {
  initializeProcessorLocalization(input.storage)
  let csrfToken: string | null = null
  const unauthorizedListeners = new Set<() => void>()
  const clearCsrfToken = () => {
    csrfToken = null
  }
  const request = makeFetchRequestAdapter({
    baseUrl: input.apiBaseUrl,
    readCsrfToken: () => csrfToken,
    onFailure: observeProcessorRequestFailure,
    onUnauthorized: () => {
      clearCsrfToken()
      unauthorizedListeners.forEach((listener) => listener())
    },
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  })

  return {
    authentication: makeApiAuthenticationAdapter({
      request,
      acceptCsrfToken: (token) => {
        csrfToken = token
      },
      clearCsrfToken,
    }),
    production: makeApiProductionAdapter(request),
    productionChanges: makeBrowserProductionChangeAdapter({
      apiBaseUrl: input.apiBaseUrl,
      ...(input.eventSourceFactory === undefined
        ? {}
        : { eventSourceFactory: input.eventSourceFactory }),
    }),
    locationPreference: makeBrowserLocationPreferenceAdapter(input.storage),
    idempotency: makeWebCryptoIdempotencyAdapter(),
    subscribeToUnauthorized: (listener) => {
      unauthorizedListeners.add(listener)
      return () => {
        unauthorizedListeners.delete(listener)
      }
    },
    now: input.now ?? (() => new Date()),
  }
}
