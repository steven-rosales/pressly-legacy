import type { AdminCliPricingApi, AdminCliSessionStore } from "./model.ts"

export type AdminCliPricingDependencies = Readonly<{
  api: AdminCliPricingApi
  session: AdminCliSessionStore
}>
