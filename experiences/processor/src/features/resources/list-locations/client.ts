import {
  listProductionLocationsResultSchema,
  type ListProductionLocationsResult,
} from "@pressly/production-system/contracts/resources/list-locations"
import type {
  ListLocationsClient,
  ListLocationsClientOperation,
  ListLocationsRequest,
} from "./types.ts"

export type ListLocationsRequestTransport = (
  input: Readonly<{
    method: "GET"
    path: string
    signal?: AbortSignal
  }>,
  outputSchema: typeof listProductionLocationsResultSchema
) => Promise<ListProductionLocationsResult>

const querySuffix = (query: ListLocationsRequest["query"]): string => {
  if (query?.includeInactive === undefined) return ""
  return `?${new URLSearchParams({
    includeInactive: String(query.includeInactive),
  }).toString()}`
}

export const makeListLocationsClient =
  (input: {
    operation: ListLocationsClientOperation
    request: ListLocationsRequestTransport
  }): ListLocationsClient =>
  async (request = {}) =>
    input.request(
      {
        method: input.operation.http.locations.method,
        path: `${input.operation.http.locations.path}${querySuffix(request.query)}`,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      },
      listProductionLocationsResultSchema
    )
