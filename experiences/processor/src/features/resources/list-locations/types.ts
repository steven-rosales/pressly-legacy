import type {
  ListProductionLocationsQuery,
  ListProductionLocationsResult,
} from "@pressly/production-system/contracts/resources/list-locations"

export type ListLocationsRequest = Readonly<{
  query?: Readonly<Partial<ListProductionLocationsQuery>>
  signal?: AbortSignal
}>

export type ListLocationsClientOperation = Readonly<{
  operationId: "production.list-locations.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    locations: Readonly<{ method: "GET"; path: string }>
  }>
}>

export type ListLocationsClient = (
  request?: ListLocationsRequest
) => Promise<ListProductionLocationsResult>
