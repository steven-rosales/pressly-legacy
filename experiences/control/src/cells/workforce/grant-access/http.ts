import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type { GrantProjection } from "../../../management/workforce/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validatedSerializedRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import {
  grantAccessBodySchema,
  membershipParamsSchema,
} from "../../../management/workforce/contracts.ts"
import { grantControlAccessContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const pathInvalid = invalidRequestDescriptor("params", {
  code: "control_workforce_path_invalid",
  message: "Control workforce route parameters are invalid.",
  safeMessage: "The requested workforce resource identifier is invalid.",
  status: 422,
})

export const grantAccessSurface = http.post<
  GrantProjection,
  ControlWorkforceFailure
>({
  path: "/control/team/:membershipId/grants",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: pathInvalid },
  validateRequest: validateRequest(
    { params: membershipParamsSchema, body: grantAccessBodySchema },
    { params: pathInvalid },
  ),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "params", membershipParamsSchema, pathInvalid),
    ...validatedSerializedRequest(request, "body", grantAccessBodySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      grantControlAccessContract.output.encode,
      201,
    ),
})
