import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  IssueInvitationInput,
  IssueInvitationOutput,
} from "../../../management/workforce/contracts.ts"
import { issueControlInvitationContract } from "./contract.ts"
import { issueInvitationSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const writeAuthorization = {
  capability: "team:write",
  timing: "before-input",
} as const

export const issueControlInvitationCellDeclaration = declareCommandCell<
  IssueInvitationInput,
  IssueInvitationOutput,
  ControlWorkforceFailure
>({
  id: "control.issue-invitation.v1",
  contract: issueControlInvitationContract,
  authorization: writeAuthorization,
  consistency: {
    transaction: "none",
    concurrency: "partitioned",
    concurrencyKey: (input) => input.email.trim().toLowerCase(),
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [issueInvitationSurface],
  observability: { operation: "control.issue_invitation" },
})
