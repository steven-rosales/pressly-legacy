import type { ProcessorListProductionHistoryActivityResult } from "../../../contracts/production-history.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { HttpRequest, HttpRequestInput } from "@pressly/cells"
import {
  invalidRequest,
  presentProcessorQuery,
} from "../../../server/model/production-query.ts"
import { listProcessorProductionHistoryActivityContract } from "./contract.ts"
import { http } from "@pressly/cells"
import {
  listProductionHistoryActivityQuerySchema,
  productionHistoryLocationParamsSchema,
} from "@pressly/production-system/contracts/read-models/production-history"

export const validatedRequest = (request: HttpRequestInput) => {
  const query = listProductionHistoryActivityQuerySchema.safeParse(
    request.query
  )
  if (!query.success) invalidRequest("query", query.error.issues)
  const params = productionHistoryLocationParamsSchema.safeParse({
    locationId: request.params["locationId"],
  })
  if (!params.success) invalidRequest("params", params.error.issues)
  return { params: params.data, query: query.data }
}

export const surface = http.get<
  ProcessorListProductionHistoryActivityResult,
  ProductionQueryFailure
>({
  path: "/production/locations/:locationId/history/activity",
  validateRequest: (request) => {
    validatedRequest(request)
    return undefined
  },
  decodeAuthorizationScope: http.validatedPathScope({
    schema: productionHistoryLocationParamsSchema,
    input: (params) => ({ locationId: params["locationId"] }),
    scope: (params) => params.locationId,
  }),
  toSerializedInput: (request: HttpRequest) => validatedRequest(request),
  present: (outcome) =>
    presentProcessorQuery(
      outcome,
      listProcessorProductionHistoryActivityContract.output.encode
    ),
})
