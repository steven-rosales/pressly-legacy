import type { AdminCliAuthApi, AdminCliSessionStore } from "./model.ts"

export type AdminCliAuthDependencies = Readonly<{
  api: AdminCliAuthApi
  session: AdminCliSessionStore
}>
