import type { ListProcessorOrderControlResult } from "../../../contracts/production-order-control.ts"
import type { DecodeResult } from "@pressly/cells"
import type { ListProductionOrderControlQuery } from "@pressly/production-system/contracts/read-models/production-order-control"
import { listProcessorOrderControlResultSchema } from "../../../contracts/production-order-control.ts"
import {
  defineProcessorQueryContract,
  isRecord,
  prefixedIssues,
} from "../../../server/model/production-query.ts"
import { decode } from "@pressly/cells"
import { productionLocationParamsSchema } from "@pressly/production-system/contracts/orders/list-order-control"
import { listProductionOrderControlQuerySchema } from "@pressly/production-system/contracts/read-models/production-order-control"

export const listProcessorProductionOrderControlOperationId =
  "processor.list-production-order-control.v1" as const

export type ListProcessorProductionOrderControlInput = Readonly<
  ListProductionOrderControlQuery & {
    locationId: string
  }
>

export const toInput = (
  locationId: string,
  query: ListProductionOrderControlQuery
): ListProcessorProductionOrderControlInput => ({
  locationId,
  view: query.view,
  ...(query.search === undefined ? {} : { search: query.search }),
  ...(query.status === undefined ? {} : { status: query.status }),
  ...(query.dueBucket === undefined ? {} : { dueBucket: query.dueBucket }),
  ...(query.productionRunId === undefined
    ? {}
    : { productionRunId: query.productionRunId }),
  ...(query.productionBatchId === undefined
    ? {}
    : { productionBatchId: query.productionBatchId }),
  ...(query.stage === undefined ? {} : { stage: query.stage }),
  ...(query.priority === undefined ? {} : { priority: query.priority }),
  ...(query.movable === undefined ? {} : { movable: query.movable }),
  ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  limit: query.limit,
})

export const queryFor = (input: ListProcessorProductionOrderControlInput) => ({
  view: input.view,
  ...(input.search === undefined ? {} : { search: input.search }),
  ...(input.status === undefined ? {} : { status: input.status }),
  ...(input.dueBucket === undefined ? {} : { dueBucket: input.dueBucket }),
  ...(input.productionRunId === undefined
    ? {}
    : { productionRunId: input.productionRunId }),
  ...(input.productionBatchId === undefined
    ? {}
    : { productionBatchId: input.productionBatchId }),
  ...(input.stage === undefined ? {} : { stage: input.stage }),
  ...(input.priority === undefined ? {} : { priority: input.priority }),
  ...(input.movable === undefined ? {} : { movable: input.movable }),
  ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
  limit: input.limit,
})

export const decodeInput = (
  serialized: unknown
): DecodeResult<ListProcessorProductionOrderControlInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      {
        path: [],
        message: "The Processor order-control input must be an object.",
      },
    ])
  const query = listProductionOrderControlQuerySchema.safeParse(
    serialized["query"]
  )
  const params = productionLocationParamsSchema.safeParse(serialized["params"])
  const issues = [
    ...(query.success ? [] : prefixedIssues("query", query.error.issues)),
    ...(params.success ? [] : prefixedIssues("params", params.error.issues)),
  ]
  if (!query.success || !params.success) return decode.invalid(issues)
  return decode.valid(toInput(params.data.locationId, query.data))
}

export const listProcessorProductionOrderControlContract =
  defineProcessorQueryContract<
    ListProcessorProductionOrderControlInput,
    ListProcessorOrderControlResult
  >({
    operation: listProcessorProductionOrderControlOperationId,
    decodeInput,
    encodeInput: (input) => ({
      params: { locationId: input.locationId },
      query: queryFor(input),
    }),
    outputSchema: listProcessorOrderControlResultSchema,
  })
