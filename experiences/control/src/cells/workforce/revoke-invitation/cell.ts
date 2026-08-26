import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  InvitationMutationInput,
  InvitationProjection,
} from "../../../management/workforce/contracts.ts"
import { revokeControlInvitationContract } from "./contract.ts"
import { revokeInvitationSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const writeAuthorization = {
  capability: "team:write",
  timing: "before-input",
} as const

export const revokeControlInvitationCellDeclaration = defineOperation<
  InvitationMutationInput,
  InvitationProjection,
  ControlWorkforceFailure
>({
  kind: "command",
  id: "control.revoke-invitation.v1",
  contract: revokeControlInvitationContract,
  authorization: writeAuthorization,
  consistency: {
    transaction: "none",
    concurrency: "optimistic",
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [revokeInvitationSurface],
  observability: { operation: "control.revoke_invitation" },
})
