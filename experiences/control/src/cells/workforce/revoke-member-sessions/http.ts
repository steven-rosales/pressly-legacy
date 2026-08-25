import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type { SessionRevocation } from "../../../management/workforce/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import {
  membershipParamsSchema,
  revokeSessionsBodySchema,
} from "../../../management/workforce/contracts.ts"
import { revokeControlMemberSessionsContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const pathInvalid = invalidRequestDescriptor("params", {
  code: "control_workforce_path_invalid",
  message: "Control workforce route parameters are invalid.",
  safeMessage: "The requested workforce resource identifier is invalid.",
  status: 422,
})

export const revokeSessionsSurface = http.post<
  SessionRevocation,
  ControlWorkforceFailure
>({
  path: "/control/team/:membershipId/sessions/revoke",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: pathInvalid },
  validateRequest: validateRequest(
    { params: membershipParamsSchema, body: revokeSessionsBodySchema },
    { params: pathInvalid },
  ),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "params", membershipParamsSchema, pathInvalid),
    ...parseRequest(request, "body", revokeSessionsBodySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      revokeControlMemberSessionsContract.output.encode,
    ),
})
