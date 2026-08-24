import type { ProcessorRemainingDayForecast } from "../../../contracts/remaining-day-forecast.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { HttpRequest, HttpRequestInput } from "@pressly/cells"
import {
  invalidRequest,
  presentProcessorQuery,
} from "../../../server/model/production-query.ts"
import { loadProcessorRemainingDayForecastContract } from "./contract.ts"
import { http } from "@pressly/cells"
import {
  productionRemainingDayForecastParamsSchema,
  productionRemainingDayForecastQuerySchema,
} from "@pressly/production-system/contracts/queries/load-remaining-day-forecast"

export const validatedRequest = (request: HttpRequestInput) => {
  const query = productionRemainingDayForecastQuerySchema.safeParse(
    request.query
  )
  if (!query.success) invalidRequest("query", query.error.issues)
  const params = productionRemainingDayForecastParamsSchema.safeParse({
    locationId: request.params["locationId"],
  })
  if (!params.success) invalidRequest("params", params.error.issues)
  return { params: params.data, query: query.data }
}

export const surface = http.get<
  ProcessorRemainingDayForecast,
  ProductionQueryFailure
>({
  path: "/production/locations/:locationId/forecast",
  validateRequest: (request) => {
    validatedRequest(request)
    return undefined
  },
  decodeAuthorizationScope: http.validatedPathScope({
    schema: productionRemainingDayForecastParamsSchema,
    input: (params) => ({ locationId: params["locationId"] }),
    scope: (params) => params.locationId,
  }),
  toSerializedInput: (request: HttpRequest) => validatedRequest(request),
  present: (outcome) =>
    presentProcessorQuery(
      outcome,
      loadProcessorRemainingDayForecastContract.output.encode
    ),
})
