import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type { InvitationPage } from "../../../management/workforce/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import { invitationListQuerySchema } from "../../../management/workforce/contracts.ts"
import { listControlInvitationsContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const listInvitationsSurface = http.get<
  InvitationPage,
  ControlWorkforceFailure
>({
  path: "/control/invitations",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: invalidRequestDescriptor("query") },
  validateRequest: validateRequest({ query: invitationListQuerySchema }),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "query", invitationListQuerySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      listControlInvitationsContract.output.encode,
    ),
})
