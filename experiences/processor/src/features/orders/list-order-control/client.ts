import {
  listProcessorOrderControlResultSchema,
  type ListProcessorOrderControlResult,
} from "../../../contracts/production-order-control.ts"
import type { ListProductionOrderControlQuery } from "@pressly/production-system/contracts/read-models/production-order-control"
import type {
  ListProductionOrderControlClient,
  ListProductionOrderControlClientOperation,
} from "./types.ts"

export type ListProductionOrderControlRequestTransport = (
  input: Readonly<{
    method: "GET"
    path: string
    signal?: AbortSignal
  }>,
  outputSchema: typeof listProcessorOrderControlResultSchema
) => Promise<ListProcessorOrderControlResult>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

const encodeQuery = (query: ListProductionOrderControlQuery): string => {
  const serialized = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) serialized.set(key, String(value))
  })
  return serialized.toString()
}

export const makeListProductionOrderControlClient =
  (input: {
    operation: ListProductionOrderControlClientOperation
    request: ListProductionOrderControlRequestTransport
  }): ListProductionOrderControlClient =>
  async ({ locationId, query, signal }) =>
    input.request(
      {
        method: input.operation.http["order-control"].method,
        path: `${renderPath(input.operation.http["order-control"].path, {
          locationId,
        })}?${encodeQuery(query)}`,
        ...(signal === undefined ? {} : { signal }),
      },
      listProcessorOrderControlResultSchema
    )
