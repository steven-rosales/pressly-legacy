import type { ProcessorProductionHistoryRunDetail } from "../../../contracts/production-history.ts"
import type { DecodeResult } from "@pressly/cells"
import { processorProductionHistoryRunDetailSchema } from "../../../contracts/production-history.ts"
import {
  defineProcessorQueryContract,
  isRecord,
  prefixedIssues,
} from "../../../server/model/production-query.ts"
import { decode } from "@pressly/cells"
import { productionHistoryRunParamsSchema } from "@pressly/production-system/contracts/read-models/production-history"

export const loadProcessorProductionHistoryRunOperationId =
  "processor.load-production-history-run.v1" as const

export type LoadProcessorProductionHistoryRunInput = Readonly<{
  locationId: string
  productionRunId: string
}>

export const decodeInput = (
  serialized: unknown
): DecodeResult<LoadProcessorProductionHistoryRunInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      {
        path: [],
        message: "The Processor history-run input must be an object.",
      },
    ])
  const params = productionHistoryRunParamsSchema.safeParse(
    serialized["params"]
  )
  return params.success
    ? decode.valid(params.data)
    : decode.invalid(prefixedIssues("params", params.error.issues))
}

export const loadProcessorProductionHistoryRunContract =
  defineProcessorQueryContract<
    LoadProcessorProductionHistoryRunInput,
    ProcessorProductionHistoryRunDetail
  >({
    operation: loadProcessorProductionHistoryRunOperationId,
    decodeInput,
    encodeInput: (input) => ({ params: { ...input } }),
    outputSchema: processorProductionHistoryRunDetailSchema,
  })
