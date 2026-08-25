import {
  listProductionHistoryPlansResultSchema,
  type ListProductionHistoryPlansResult,
} from "@pressly/production-system/contracts/read-models/production-history"
import type {
  ListHistoryPlansClient,
  ListHistoryPlansClientOperation,
  ListHistoryPlansRequest,
} from "./types.ts"

export type ListHistoryPlansRequestTransport = (
  input: Readonly<{
    method: "GET"
    path: string
    signal?: AbortSignal
  }>,
  outputSchema: typeof listProductionHistoryPlansResultSchema
) => Promise<ListProductionHistoryPlansResult>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

const encodeQuery = (query: ListHistoryPlansRequest["query"]): string => {
  const serialized = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) serialized.set(key, String(value))
  })
  return serialized.toString()
}

export const makeListHistoryPlansClient =
  (input: {
    operation: ListHistoryPlansClientOperation
    request: ListHistoryPlansRequestTransport
  }): ListHistoryPlansClient =>
  async ({ locationId, query, signal }) =>
    input.request(
      {
        method: input.operation.http.plans.method,
        path: `${renderPath(input.operation.http.plans.path, {
          locationId,
        })}?${encodeQuery(query)}`,
        ...(signal === undefined ? {} : { signal }),
      },
      listProductionHistoryPlansResultSchema
    )
