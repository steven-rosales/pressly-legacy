import type { ProcessorProductionWorkspace } from "../../../contracts/production-workspace.ts"
import type { ProductionQueryFailure } from "../../../server/model/production-query.ts"
import type { HttpRequest, HttpRequestInput } from "@pressly/cells"
import {
  invalidRequest,
  presentProcessorQuery,
} from "../../../server/model/production-query.ts"
import { loadProcessorProductionWorkspaceContract } from "./contract.ts"
import { http } from "@pressly/cells"
import {
  productionWorkspaceParamsSchema,
  productionWorkspaceQuerySchema,
} from "@pressly/production-system/contracts/queries/load-workspace"

export const validatedRequest = (request: HttpRequestInput) => {
  const query = productionWorkspaceQuerySchema.safeParse(request.query)
  if (!query.success) invalidRequest("query", query.error.issues)
  const params = productionWorkspaceParamsSchema.safeParse({
    locationId: request.params["locationId"],
    ...(request.params["shiftId"] === undefined
      ? {}
      : { shiftId: request.params["shiftId"] }),
  })
  if (!params.success) invalidRequest("params", params.error.issues)
  return { params: params.data, query: query.data }
}

export const surface = http.get<
  ProcessorProductionWorkspace,
  ProductionQueryFailure
>({
  path: "/production/locations/:locationId/workspace",
  validateRequest: (request) => {
    validatedRequest(request)
    return undefined
  },
  decodeAuthorizationScope: http.validatedPathScope({
    schema: productionWorkspaceParamsSchema,
    input: (params) => ({
      locationId: params["locationId"],
      ...(params["shiftId"] === undefined
        ? {}
        : { shiftId: params["shiftId"] }),
    }),
    scope: (params) => params.locationId,
  }),
  toSerializedInput: (request: HttpRequest) => validatedRequest(request),
  present: (outcome) =>
    presentProcessorQuery(
      outcome,
      loadProcessorProductionWorkspaceContract.output.encode
    ),
})
