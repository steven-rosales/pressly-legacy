import type { ProcessorProductionWorkspace } from "../../../contracts/production-workspace.ts"
import type { DecodeResult } from "@pressly/cells"
import { processorProductionWorkspaceSchema } from "../../../contracts/production-workspace.ts"
import {
  defineProcessorQueryContract,
  isRecord,
  prefixedIssues,
} from "../../../server/model/production-query.ts"
import { decode } from "@pressly/cells"
import {
  productionWorkspaceParamsSchema,
  productionWorkspaceQuerySchema,
} from "@pressly/production-system/contracts/queries/load-workspace"

export const loadProcessorProductionWorkspaceOperationId =
  "processor.load-production-workspace.v1" as const

export type LoadProcessorProductionWorkspaceInput = Readonly<{
  locationId: string
  shiftId?: string
}>

export const decodeInput = (
  serialized: unknown
): DecodeResult<LoadProcessorProductionWorkspaceInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: "The Processor workspace input must be an object." },
    ])
  const query = productionWorkspaceQuerySchema.safeParse(serialized["query"])
  const params = productionWorkspaceParamsSchema.safeParse(serialized["params"])
  const issues = [
    ...(query.success ? [] : prefixedIssues("query", query.error.issues)),
    ...(params.success ? [] : prefixedIssues("params", params.error.issues)),
  ]
  if (!query.success || !params.success) return decode.invalid(issues)
  return decode.valid({
    locationId: params.data.locationId,
    ...(query.data.shiftId === undefined
      ? {}
      : { shiftId: query.data.shiftId }),
  })
}

export const loadProcessorProductionWorkspaceContract =
  defineProcessorQueryContract<
    LoadProcessorProductionWorkspaceInput,
    ProcessorProductionWorkspace
  >({
    operation: loadProcessorProductionWorkspaceOperationId,
    decodeInput,
    encodeInput: (input) => ({
      params: { locationId: input.locationId },
      query: {
        ...(input.shiftId === undefined ? {} : { shiftId: input.shiftId }),
      },
    }),
    outputSchema: processorProductionWorkspaceSchema,
  })
