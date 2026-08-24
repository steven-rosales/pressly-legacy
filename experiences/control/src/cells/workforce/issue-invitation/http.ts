import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type { IssueInvitationOutput } from "../../../management/workforce/contracts.ts"
import { controlManagementContext } from "../../../management/model/context.ts"
import { presentControlManagement } from "../../../management/model/failure.ts"
import {
  constantAuthorizationScope,
  invalidRequestDescriptor,
  parseRequest,
  validateRequest,
} from "../../../management/model/http.ts"
import { issueInvitationBodySchema } from "../../../management/workforce/contracts.ts"
import { issueControlInvitationContract } from "./contract.ts"
import { http } from "@pressly/cells"

export const issueInvitationSurface = http.post<
  IssueInvitationOutput,
  ControlWorkforceFailure
>({
  path: "/control/invitations",
  bodyLimit: "16kb",
  contextRequirements: ["control-request-context"],
  invalidRequest: { input: invalidRequestDescriptor("body") },
  validateRequest: validateRequest({ body: issueInvitationBodySchema }),
  decodeAuthorizationScope: constantAuthorizationScope,
  toSerializedInput: (request) => ({
    context: controlManagementContext(request),
    ...parseRequest(request, "body", issueInvitationBodySchema),
  }),
  present: (outcome) =>
    presentControlManagement(
      outcome,
      issueControlInvitationContract.output.encode,
      outcome.kind === "success" && outcome.value.status === "issued"
        ? 201
        : 200,
    ),
})
