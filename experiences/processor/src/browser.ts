export { makeProcessorAuthenticationBrowserClient } from "./browser/authentication/client.ts"
export { makeProcessorBrowserRequestTransport } from "./browser/transport.ts"
export type {
  ProcessorAuthenticationBrowserClient,
  ProcessorAuthenticationOperations,
} from "./browser/authentication/types.ts"
export { makeProcessorOrdersBrowserClient } from "./browser/orders/client.ts"
export type {
  ProcessorOrderOperations,
  ProcessorOrdersBrowserClient,
} from "./browser/orders/types.ts"
export type {
  BrowserHttpMethod,
  BrowserHttpSurface,
  BrowserResponseCodec,
  GeneratedBrowserOperation,
  ProcessorBrowserRequest,
  ProcessorBrowserRequestTransport,
} from "./browser/transport.ts"
export { createProcessorBrowserExperience } from "./browser/processor-browser-experience.tsx"
export type { ProcessorBrowserExperienceApplication } from "./browser/processor-browser-experience.tsx"
export {
  ProcessorBrowserCapabilitiesProvider,
  useProcessorBrowserCapabilities,
} from "./browser/browser-capabilities.tsx"
export type {
  ProcessorBrowserCapabilities,
  ProcessorBrowserConnectivity,
  ProcessorBrowserKeyInput,
  ProcessorBrowserStorageChange,
} from "./browser/browser-capabilities.tsx"
export { ProcessorErrorFallback } from "./browser/shell/processor-error-fallback.tsx"
export type { ProcessorRuntime } from "./browser/processor-runtime.ts"
export { ProcessorApp } from "./browser/shell/app.tsx"
export { requestFailure } from "./capabilities/request.error.ts"
export type {
  RequestFailure,
  RequestFailureKind,
} from "./capabilities/request.error.ts"
export type { RequestInput, RequestPort } from "./capabilities/request.port.ts"
export type { AuthenticationPort } from "./capabilities/authentication.port.ts"
export type { IdempotencyPort } from "./capabilities/idempotency.port.ts"
export type { LocationPreferencePort } from "./capabilities/location-preference.port.ts"
export type { OrderManagementPort } from "./capabilities/order-management.port.ts"
export type { ProductionChangePort } from "./capabilities/production-change.port.ts"
export type { ProductionPort } from "./capabilities/production.port.ts"
export {
  initializeProcessorLocalization,
  processorLanguageStorageKey,
} from "./browser/localization/index.ts"
