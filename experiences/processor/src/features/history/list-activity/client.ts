import {
  processorListProductionHistoryActivityResultSchema,
  type ProcessorListProductionHistoryActivityResult,
} from "../../../contracts/production-history.ts"
import type { ListProductionHistoryActivityQuery } from "@pressly/production-system/contracts/read-models/production-history"
import type {
  ListProductionHistoryActivityClient,
  ListProductionHistoryActivityClientOperation,
} from "./types.ts"

export type ListProductionHistoryActivityRequestTransport = (
  input: Readonly<{
    method: "GET"
    path: string
    signal?: AbortSignal
  }>,
  outputSchema: typeof processorListProductionHistoryActivityResultSchema
) => Promise<ProcessorListProductionHistoryActivityResult>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

const encodeQuery = (query: ListProductionHistoryActivityQuery): string => {
  const serialized = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) serialized.set(key, String(value))
  })
  return serialized.toString()
}

export const makeListProductionHistoryActivityClient =
  (input: {
    operation: ListProductionHistoryActivityClientOperation
    request: ListProductionHistoryActivityRequestTransport
  }): ListProductionHistoryActivityClient =>
  async ({ locationId, query, signal }) =>
    input.request(
      {
        method: input.operation.http.activity.method,
        path: `${renderPath(input.operation.http.activity.path, {
          locationId,
        })}?${encodeQuery(query)}`,
        ...(signal === undefined ? {} : { signal }),
      },
      processorListProductionHistoryActivityResultSchema
    )
