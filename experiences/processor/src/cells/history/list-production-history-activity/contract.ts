import type { ProcessorListProductionHistoryActivityResult } from "../../../contracts/production-history.ts"
import type { DecodeResult } from "@pressly/cells"
import type { ListProductionHistoryActivityQuery } from "@pressly/production-system/contracts/read-models/production-history"
import { processorListProductionHistoryActivityResultSchema } from "../../../contracts/production-history.ts"
import {
  defineProcessorQueryContract,
  isRecord,
  prefixedIssues,
} from "../../../server/model/production-query.ts"
import { decode } from "@pressly/cells"
import {
  listProductionHistoryActivityQuerySchema,
  productionHistoryLocationParamsSchema,
} from "@pressly/production-system/contracts/read-models/production-history"

export const listProcessorProductionHistoryActivityOperationId =
  "processor.list-production-history-activity.v1" as const

export type ListProcessorProductionHistoryActivityInput = Readonly<
  Omit<ListProductionHistoryActivityQuery, "occurredAfter"> & {
    locationId: string
    occurredAfter?: Date
  }
>

export const toInput = (
  locationId: string,
  query: ListProductionHistoryActivityQuery
): ListProcessorProductionHistoryActivityInput => ({
  locationId,
  limit: query.limit,
  ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  ...(query.runId === undefined ? {} : { runId: query.runId }),
  ...(query.entityType === undefined ? {} : { entityType: query.entityType }),
  ...(query.eventType === undefined ? {} : { eventType: query.eventType }),
  ...(query.orderResolution === undefined
    ? {}
    : { orderResolution: query.orderResolution }),
  ...(query.search === undefined ? {} : { search: query.search }),
  ...(query.occurredAfter === undefined
    ? {}
    : { occurredAfter: new Date(query.occurredAfter) }),
})

export const decodeInput = (
  serialized: unknown
): DecodeResult<ListProcessorProductionHistoryActivityInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: "The Processor activity input must be an object." },
    ])
  const query = listProductionHistoryActivityQuerySchema.safeParse(
    serialized["query"]
  )
  const params = productionHistoryLocationParamsSchema.safeParse(
    serialized["params"]
  )
  const issues = [
    ...(query.success ? [] : prefixedIssues("query", query.error.issues)),
    ...(params.success ? [] : prefixedIssues("params", params.error.issues)),
  ]
  if (!query.success || !params.success) return decode.invalid(issues)
  return decode.valid(toInput(params.data.locationId, query.data))
}

export const encodeQuery = (
  input: ListProcessorProductionHistoryActivityInput
) => ({
  limit: input.limit,
  ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
  ...(input.runId === undefined ? {} : { runId: input.runId }),
  ...(input.entityType === undefined ? {} : { entityType: input.entityType }),
  ...(input.eventType === undefined ? {} : { eventType: input.eventType }),
  ...(input.orderResolution === undefined
    ? {}
    : { orderResolution: input.orderResolution }),
  ...(input.search === undefined ? {} : { search: input.search }),
  ...(input.occurredAfter === undefined
    ? {}
    : { occurredAfter: input.occurredAfter.toISOString() }),
})

export const listProcessorProductionHistoryActivityContract =
  defineProcessorQueryContract<
    ListProcessorProductionHistoryActivityInput,
    ProcessorListProductionHistoryActivityResult
  >({
    operation: listProcessorProductionHistoryActivityOperationId,
    decodeInput,
    encodeInput: (input) => ({
      params: { locationId: input.locationId },
      query: encodeQuery(input),
    }),
    outputSchema: processorListProductionHistoryActivityResultSchema,
  })
