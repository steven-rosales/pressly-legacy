import { http } from "@pressly/cells"
import { controlManagementContext } from "../../../management/model/context.ts"
import {
  presentControlManagement,
  type ControlWorkforceFailure,
} from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import {
  membershipMutationBodySchema,
  membershipParamsSchema,
  type MembershipTransitionOutput,
} from "../../../management/workforce/contracts.ts"
import { suspendControlMembershipContract } from "./contract.ts"

const pathInvalid = invalidRequestDescriptor("params", {
  code: "control_workforce_path_invalid",
  message: "Control workforce route parameters are invalid.",
  safeMessage: "The requested workforce resource identifier is invalid.",
  status: 422,
})

export const suspendSurface = http.post<
  MembershipTransitionOutput,
  ControlWorkforceFailure
>({
  path: "/control/team/:membershipId/suspend",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: pathInvalid },
  validateRequest: validateRequest(
    { params: membershipParamsSchema, body: membershipMutationBodySchema },
    { params: pathInvalid },
  ),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "params", membershipParamsSchema, pathInvalid),
    ...parseRequest(request, "body", membershipMutationBodySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      suspendControlMembershipContract.output.encode,
    ),
})
