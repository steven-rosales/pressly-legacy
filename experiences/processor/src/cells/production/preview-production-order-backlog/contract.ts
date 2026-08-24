import type { ProcessorProductionOrderBacklogPreview } from "../../../contracts/production-order-backlog.ts"
import type { DecodeResult } from "@pressly/cells"
import type { PreviewProductionOrderBacklogCommand } from "@pressly/production-system/contracts/read-models/production-order-backlog"
import { processorProductionOrderBacklogPreviewSchema } from "../../../contracts/production-order-backlog.ts"
import {
  defineProcessorQueryContract,
  isRecord,
  prefixedIssues,
} from "../../../server/model/production-query.ts"
import { decode } from "@pressly/cells"
import { productionLocationParamsSchema } from "@pressly/production-system/contracts/demand/preview-order-backlog"
import { previewProductionOrderBacklogRequestSchema } from "@pressly/production-system/contracts/read-models/production-order-backlog"

export const previewProcessorProductionOrderBacklogOperationId =
  "processor.preview-production-order-backlog.v1" as const

export const decodeInput = (
  serialized: unknown
): DecodeResult<PreviewProductionOrderBacklogCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: "The Processor backlog input must be an object." },
    ])
  const body = previewProductionOrderBacklogRequestSchema.safeParse(
    serialized["body"]
  )
  const params = productionLocationParamsSchema.safeParse(serialized["params"])
  const issues = [
    ...(body.success ? [] : prefixedIssues("body", body.error.issues)),
    ...(params.success ? [] : prefixedIssues("params", params.error.issues)),
  ]
  if (!body.success || !params.success) return decode.invalid(issues)
  return decode.valid({ locationId: params.data.locationId, ...body.data })
}

export const previewProcessorProductionOrderBacklogContract =
  defineProcessorQueryContract<
    PreviewProductionOrderBacklogCommand,
    ProcessorProductionOrderBacklogPreview
  >({
    operation: previewProcessorProductionOrderBacklogOperationId,
    decodeInput,
    encodeInput: (input) => ({
      params: { locationId: input.locationId },
      body: {
        filter: input.filter,
        cutoff: input.cutoff,
        reason: input.reason,
        cursor: input.cursor,
        maxOrders: input.maxOrders,
      },
    }),
    outputSchema: processorProductionOrderBacklogPreviewSchema,
  })
