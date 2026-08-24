import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type { MemberDetail } from "../../../management/workforce/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import { membershipParamsSchema } from "../../../management/workforce/contracts.ts"
import { getControlMemberContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const pathInvalid = invalidRequestDescriptor("params", {
  code: "control_workforce_path_invalid",
  message: "Control workforce route parameters are invalid.",
  safeMessage: "The requested workforce resource identifier is invalid.",
  status: 422,
})

export const getMemberSurface = http.get<MemberDetail, ControlWorkforceFailure>(
  {
    path: "/control/team/:membershipId",
    bodyLimit: "16kb",
    contextRequirements: ["control-request-context"],
    invalidRequest: { input: pathInvalid },
    validateRequest: validateRequest(
      { params: membershipParamsSchema },
      { params: pathInvalid },
    ),
    decodeAuthorizationScope: constantAuthorizationScope,
    toSerializedInput: (request) => ({
      context: controlManagementContext(request),
      ...parseRequest(request, "params", membershipParamsSchema, pathInvalid),
    }),
    present: (outcome) =>
      presentControlManagement(outcome, getControlMemberContract.output.encode),
  },
)
