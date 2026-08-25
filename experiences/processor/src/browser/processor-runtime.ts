import type { Clock } from "@pressly/time"
import type { AuthenticationPort } from "../capabilities/authentication.port.ts"
import type { IdempotencyPort } from "../capabilities/idempotency.port.ts"
import type { LocationPreferencePort } from "../capabilities/location-preference.port.ts"
import type { OrderManagementPort } from "../capabilities/order-management.port.ts"
import type { ProductionChangePort } from "../capabilities/production-change.port.ts"
import type { ProductionPort } from "../capabilities/production.port.ts"

export type ProcessorRuntime = Readonly<{
  authentication: AuthenticationPort
  orderManagement: OrderManagementPort
  production: ProductionPort
  productionChanges: ProductionChangePort
  locationPreference: LocationPreferencePort
  idempotency: IdempotencyPort
  subscribeToUnauthorized: (listener: () => void) => () => void
  observeConnectionState: (
    state: "connecting" | "open" | "reconnecting"
  ) => void
  now: Clock["now"]
}>
