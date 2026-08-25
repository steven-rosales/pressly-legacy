import {
  listProductionHistoryRunsResultSchema,
  type ListProductionHistoryRunsResult,
} from "@pressly/production-system/contracts/read-models/production-history"
import type {
  ListHistoryRunsClient,
  ListHistoryRunsClientOperation,
  ListHistoryRunsRequest,
} from "./types.ts"

export type ListHistoryRunsRequestTransport = (
  input: Readonly<{
    method: "GET"
    path: string
    signal?: AbortSignal
  }>,
  outputSchema: typeof listProductionHistoryRunsResultSchema
) => Promise<ListProductionHistoryRunsResult>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

const encodeQuery = (query: ListHistoryRunsRequest["query"]): string => {
  const serialized = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) serialized.set(key, String(value))
  })
  return serialized.toString()
}

export const makeListHistoryRunsClient =
  (input: {
    operation: ListHistoryRunsClientOperation
    request: ListHistoryRunsRequestTransport
  }): ListHistoryRunsClient =>
  async ({ locationId, query, signal }) =>
    input.request(
      {
        method: input.operation.http.runs.method,
        path: `${renderPath(input.operation.http.runs.path, {
          locationId,
        })}?${encodeQuery(query)}`,
        ...(signal === undefined ? {} : { signal }),
      },
      listProductionHistoryRunsResultSchema
    )
