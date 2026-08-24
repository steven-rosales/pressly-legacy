import type { ProcessorProductionHistoryRunDetail } from "../../../contracts/production-history.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { HttpRequest, HttpRequestInput } from "@pressly/cells"
import {
  invalidRequest,
  presentProcessorQuery,
} from "../../../server/model/production-query.ts"
import { loadProcessorProductionHistoryRunContract } from "./contract.ts"
import { http } from "@pressly/cells"
import { productionHistoryRunParamsSchema } from "@pressly/production-system/contracts/read-models/production-history"

export const validatedParams = (request: HttpRequestInput) => {
  const params = productionHistoryRunParamsSchema.safeParse({
    locationId: request.params["locationId"],
    productionRunId: request.params["productionRunId"],
  })
  if (!params.success) invalidRequest("params", params.error.issues)
  return params.data
}

export const surface = http.get<
  ProcessorProductionHistoryRunDetail,
  ProductionQueryFailure
>({
  path: "/production/locations/:locationId/history/runs/:productionRunId",
  validateRequest: (request) => {
    validatedParams(request)
    return undefined
  },
  decodeAuthorizationScope: http.validatedPathScope({
    schema: productionHistoryRunParamsSchema,
    input: (params) => ({
      locationId: params["locationId"],
      productionRunId: params["productionRunId"],
    }),
    scope: (params) => params.locationId,
  }),
  toSerializedInput: (request: HttpRequest) => ({
    params: validatedParams(request),
  }),
  present: (outcome) =>
    presentProcessorQuery(
      outcome,
      loadProcessorProductionHistoryRunContract.output.encode
    ),
})
