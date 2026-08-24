import type { ProcessorProductionBoard } from "../../../contracts/production-board.ts"
import type { DecodeResult } from "@pressly/cells"
import { processorProductionBoardSchema } from "../../../contracts/production-board.ts"
import {
  defineProcessorQueryContract,
  isRecord,
  prefixedIssues,
} from "../../../server/model/production-query.ts"
import { decode } from "@pressly/cells"
import { productionRunBoardParamsSchema } from "@pressly/production-system/contracts/queries/load-board"

export const loadProcessorProductionBoardOperationId =
  "processor.load-production-board.v1" as const

export type LoadProcessorProductionBoardInput = Readonly<{
  locationId: string
  productionRunId: string
}>

export const decodeInput = (
  serialized: unknown
): DecodeResult<LoadProcessorProductionBoardInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: "The Processor board input must be an object." },
    ])
  const params = productionRunBoardParamsSchema.safeParse(serialized["params"])
  return params.success
    ? decode.valid(params.data)
    : decode.invalid(prefixedIssues("params", params.error.issues))
}

export const loadProcessorProductionBoardContract =
  defineProcessorQueryContract<
    LoadProcessorProductionBoardInput,
    ProcessorProductionBoard
  >({
    operation: loadProcessorProductionBoardOperationId,
    decodeInput,
    encodeInput: (input) => ({ params: { ...input } }),
    outputSchema: processorProductionBoardSchema,
  })
