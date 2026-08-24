import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  InvitationMutationInput,
  IssueInvitationOutput,
} from "../../../management/workforce/contracts.ts"
import { reissueControlInvitationContract } from "./contract.ts"
import { reissueInvitationSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const writeAuthorization = {
  capability: "team:write",
  timing: "before-input",
} as const

export const reissueControlInvitationCellDeclaration = declareCommandCell<
  InvitationMutationInput,
  IssueInvitationOutput,
  ControlWorkforceFailure
>({
  id: "control.reissue-invitation.v1",
  contract: reissueControlInvitationContract,
  authorization: writeAuthorization,
  consistency: {
    transaction: "none",
    concurrency: "optimistic",
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [reissueInvitationSurface],
  observability: { operation: "control.reissue_invitation" },
})
