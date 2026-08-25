import {
  listProductionOrdersResultSchema,
  type ListProductionOrdersResult,
} from "@pressly/production-system/contracts/orders/list-orders"
import type {
  ListOrdersClient,
  ListOrdersClientOperation,
  ListOrdersQuery,
} from "./types.ts"

export type ListOrdersRequestTransport = (
  input: Readonly<{
    method: "GET"
    path: string
    signal?: AbortSignal
  }>,
  outputSchema: typeof listProductionOrdersResultSchema
) => Promise<ListProductionOrdersResult>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

const encodeQuery = (query: ListOrdersQuery = {}): string => {
  const serialized = new URLSearchParams({
    limit: String(query.limit ?? 100),
  })
  if (query.status !== undefined) serialized.set("status", query.status)
  if (query.dueAfter !== undefined) serialized.set("dueAfter", query.dueAfter)
  if (query.dueBefore !== undefined)
    serialized.set("dueBefore", query.dueBefore)
  if (query.cursor !== undefined) serialized.set("cursor", query.cursor)
  return serialized.toString()
}

export const makeListOrdersClient =
  (input: {
    operation: ListOrdersClientOperation
    request: ListOrdersRequestTransport
  }): ListOrdersClient =>
  async ({ locationId, query, signal }) =>
    input.request(
      {
        method: input.operation.http.orders.method,
        path: `${renderPath(input.operation.http.orders.path, {
          locationId,
        })}?${encodeQuery(query)}`,
        ...(signal === undefined ? {} : { signal }),
      },
      listProductionOrdersResultSchema
    )
