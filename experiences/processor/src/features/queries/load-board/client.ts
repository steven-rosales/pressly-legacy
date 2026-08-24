import {
  processorProductionBoardSchema,
  type ProcessorProductionBoard,
} from "../../../contracts/production-board.ts"
import type {
  LoadProductionBoardClient,
  LoadProductionBoardClientOperation,
} from "./types.ts"

export type LoadProductionBoardRequestTransport = (
  input: Readonly<{
    method: "GET"
    path: string
    signal?: AbortSignal
  }>,
  outputSchema: typeof processorProductionBoardSchema
) => Promise<ProcessorProductionBoard>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string; productionRunId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

export const makeLoadProductionBoardClient =
  (input: {
    operation: LoadProductionBoardClientOperation
    request: LoadProductionBoardRequestTransport
  }): LoadProductionBoardClient =>
  async (locationId, productionRunId, signal) =>
    input.request(
      {
        method: input.operation.http.board.method,
        path: renderPath(input.operation.http.board.path, {
          locationId,
          productionRunId,
        }),
        ...(signal === undefined ? {} : { signal }),
      },
      processorProductionBoardSchema
    )
