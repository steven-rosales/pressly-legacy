import {
  processorProductionHistoryRunDetailSchema,
  type ProcessorProductionHistoryRunDetail,
} from "../../../contracts/production-history.ts"
import type {
  LoadProductionHistoryRunClient,
  LoadProductionHistoryRunClientOperation,
} from "./types.ts"

export type LoadProductionHistoryRunRequestTransport = (
  input: Readonly<{
    method: "GET"
    path: string
    signal?: AbortSignal
  }>,
  outputSchema: typeof processorProductionHistoryRunDetailSchema
) => Promise<ProcessorProductionHistoryRunDetail>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string; productionRunId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

export const makeLoadProductionHistoryRunClient =
  (input: {
    operation: LoadProductionHistoryRunClientOperation
    request: LoadProductionHistoryRunRequestTransport
  }): LoadProductionHistoryRunClient =>
  async (locationId, productionRunId, signal) =>
    input.request(
      {
        method: input.operation.http.request.method,
        path: renderPath(input.operation.http.request.path, {
          locationId,
          productionRunId,
        }),
        ...(signal === undefined ? {} : { signal }),
      },
      processorProductionHistoryRunDetailSchema
    )
