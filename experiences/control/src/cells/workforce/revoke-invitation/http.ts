import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type { InvitationProjection } from "../../../management/workforce/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import {
  invitationParamsSchema,
  membershipMutationBodySchema,
} from "../../../management/workforce/contracts.ts"
import { revokeControlInvitationContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const pathInvalid = invalidRequestDescriptor("params", {
  code: "control_workforce_path_invalid",
  message: "Control workforce route parameters are invalid.",
  safeMessage: "The requested workforce resource identifier is invalid.",
  status: 422,
})

export const revokeInvitationSurface = http.post<
  InvitationProjection,
  ControlWorkforceFailure
>({
  path: "/control/invitations/:invitationId/revoke",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: pathInvalid },
  validateRequest: validateRequest(
    { params: invitationParamsSchema, body: membershipMutationBodySchema },
    { params: pathInvalid },
  ),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "params", invitationParamsSchema, pathInvalid),
    ...parseRequest(request, "body", membershipMutationBodySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      revokeControlInvitationContract.output.encode,
    ),
})
