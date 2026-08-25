import type { ProcessorProductionOrderBacklogPreview } from "../../../contracts/production-order-backlog.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { HttpRequest, HttpRequestInput } from "@pressly/cells"
import {
  invalidRequest,
  presentProcessorQuery,
} from "../../../server/model/production-query.ts"
import { previewProcessorProductionOrderBacklogContract } from "./contract.ts"
import { http } from "@pressly/cells"
import { productionLocationParamsSchema } from "@pressly/production-system/contracts/demand/preview-order-backlog"
import { previewProductionOrderBacklogRequestSchema } from "@pressly/production-system/contracts/read-models/production-order-backlog"

export const validatedRequest = (request: HttpRequestInput) => {
  const body = previewProductionOrderBacklogRequestSchema.safeParse(
    request.body
  )
  if (!body.success) invalidRequest("body", body.error.issues)
  const params = productionLocationParamsSchema.safeParse({
    locationId: request.params["locationId"],
  })
  if (!params.success) invalidRequest("params", params.error.issues)
  return { body: body.data, params: params.data }
}

export const surface = http.post<
  ProcessorProductionOrderBacklogPreview,
  ProductionQueryFailure
>({
  path: "/production/locations/:locationId/order-backlog/preview",
  bodyLimit: "64kb",
  invalidRequest: {
    input: {
      code: "invalid_body_type",
      message: "Validation body failed.",
      status: 400,
      location: "body",
    },
  },
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
      previewProcessorProductionOrderBacklogContract.output.encode
    ),
})
