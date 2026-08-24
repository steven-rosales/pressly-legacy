import type { ProcessorRemainingDayForecast } from "../../../contracts/remaining-day-forecast.ts"
import type { DecodeResult } from "@pressly/cells"
import { processorRemainingDayForecastSchema } from "../../../contracts/remaining-day-forecast.ts"
import {
  defineProcessorQueryContract,
  isRecord,
  prefixedIssues,
} from "../../../server/model/production-query.ts"
import { decode } from "@pressly/cells"
import {
  productionRemainingDayForecastParamsSchema,
  productionRemainingDayForecastQuerySchema,
} from "@pressly/production-system/contracts/queries/load-remaining-day-forecast"

export const loadProcessorRemainingDayForecastOperationId =
  "processor.load-remaining-day-forecast.v1" as const

export type LoadProcessorRemainingDayForecastInput = Readonly<{
  locationId: string
  serviceDay: string
}>

export const decodeInput = (
  serialized: unknown
): DecodeResult<LoadProcessorRemainingDayForecastInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: "The Processor forecast input must be an object." },
    ])
  const query = productionRemainingDayForecastQuerySchema.safeParse(
    serialized["query"]
  )
  const params = productionRemainingDayForecastParamsSchema.safeParse(
    serialized["params"]
  )
  const issues = [
    ...(query.success ? [] : prefixedIssues("query", query.error.issues)),
    ...(params.success ? [] : prefixedIssues("params", params.error.issues)),
  ]
  if (!query.success || !params.success) return decode.invalid(issues)
  return decode.valid({
    locationId: params.data.locationId,
    serviceDay: query.data.serviceDay,
  })
}

export const loadProcessorRemainingDayForecastContract =
  defineProcessorQueryContract<
    LoadProcessorRemainingDayForecastInput,
    ProcessorRemainingDayForecast
  >({
    operation: loadProcessorRemainingDayForecastOperationId,
    decodeInput,
    encodeInput: (input) => ({
      params: { locationId: input.locationId },
      query: { serviceDay: input.serviceDay },
    }),
    outputSchema: processorRemainingDayForecastSchema,
  })
