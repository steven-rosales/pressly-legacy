import type { ListProcessorOrderControlResult } from "../../../contracts/production-order-control.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { HttpRequest, HttpRequestInput } from "@pressly/cells"
import {
  invalidRequest,
  presentProcessorQuery,
} from "../../../server/model/production-query.ts"
import { listProcessorProductionOrderControlContract } from "./contract.ts"
import { http } from "@pressly/cells"
import { productionLocationParamsSchema } from "@pressly/production-system/contracts/orders/list-order-control"
import { listProductionOrderControlQuerySchema } from "@pressly/production-system/contracts/read-models/production-order-control"

export const validatedRequest = (request: HttpRequestInput) => {
  const query = listProductionOrderControlQuerySchema.safeParse(request.query)
  if (!query.success) invalidRequest("query", query.error.issues)
  const params = productionLocationParamsSchema.safeParse({
    locationId: request.params["locationId"],
  })
  if (!params.success) invalidRequest("params", params.error.issues)
  return { params: params.data, query: query.data }
}

export const surface = http.get<
  ListProcessorOrderControlResult,
  ProductionQueryFailure
>({
  path: "/production/locations/:locationId/order-control",
  validateRequest: (request) => {
    validatedRequest(request)
    return undefined
  },
  decodeAuthorizationScope: http.validatedPathScope({
    schema: productionLocationParamsSchema,
    input: (params) => ({ locationId: params["locationId"] }),
    scope: (params) => params.locationId,
  }),
  toSerializedInput: (request: HttpRequest) => validatedRequest(request),
  present: (outcome) =>
    presentProcessorQuery(
      outcome,
      listProcessorProductionOrderControlContract.output.encode
    ),
})
