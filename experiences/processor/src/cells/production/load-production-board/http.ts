import type { ProcessorProductionBoard } from "../../../contracts/production-board.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { HttpRequest, HttpRequestInput } from "@pressly/cells"
import {
  invalidRequest,
  presentProcessorQuery,
} from "../../../server/model/production-query.ts"
import { loadProcessorProductionBoardContract } from "./contract.ts"
import { http } from "@pressly/cells"
import { productionRunBoardParamsSchema } from "@pressly/production-system/contracts/queries/load-board"

export const validatedParams = (request: HttpRequestInput) => {
  const params = productionRunBoardParamsSchema.safeParse({
    locationId: request.params["locationId"],
    productionRunId: request.params["productionRunId"],
  })
  if (!params.success) invalidRequest("params", params.error.issues)
  return params.data
}

export const surface = http.get<
  ProcessorProductionBoard,
  ProductionQueryFailure
>({
  path: "/production/locations/:locationId/runs/:productionRunId/board",
  invalidRequest: {
    input: {
      code: "invalid_params_type",
      message: "Validation params failed.",
      status: 400,
      location: "params",
    },
  },
  validateRequest: (request) => {
    validatedParams(request)
    return undefined
  },
  decodeAuthorizationScope: http.validatedPathScope({
    schema: productionRunBoardParamsSchema,
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
      loadProcessorProductionBoardContract.output.encode
    ),
})
