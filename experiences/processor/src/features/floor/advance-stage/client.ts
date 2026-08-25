import {
  advanceProductionStageResultSchema,
  type AdvanceProductionStageResult,
} from "@pressly/production-system/contracts/floor/advance-stage"
import type {
  AdvanceStageClientOperation,
  AdvanceStageRequest,
} from "./types.ts"

type AdvanceStageRequestBody = Readonly<{
  expectedVersion: number
  idempotencyKey: string
  confirmation?: NonNullable<AdvanceStageRequest["confirmation"]>
}>

export type AdvanceStageRequestTransport = (
  input: Readonly<{
    method: "POST"
    path: string
    body: AdvanceStageRequestBody
  }>,
  outputSchema: typeof advanceProductionStageResultSchema
) => Promise<AdvanceProductionStageResult>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string; stageRunId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

export const makeAdvanceStageClient =
  (input: {
    operation: AdvanceStageClientOperation
    request: AdvanceStageRequestTransport
  }): ((
    request: AdvanceStageRequest
  ) => Promise<AdvanceProductionStageResult>) =>
  async ({ locationId, stageRunId, transition, ...body }) => {
    const surface = input.operation.http[transition]
    return input.request(
      {
        method: surface.method,
        path: renderPath(surface.path, { locationId, stageRunId }),
        body,
      },
      advanceProductionStageResultSchema
    )
  }
