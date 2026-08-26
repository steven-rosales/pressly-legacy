import type { ControlWorkforceFailure } from "../../../management/model/failure.ts"
import type {
  InvitationPage,
  ListInvitationsInput,
} from "../../../management/workforce/contracts.ts"
import { listControlInvitationsContract } from "./contract.ts"
import { listInvitationsSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const readAuthorization = {
  capability: "team:read",
  timing: "before-input",
} as const

export const listControlInvitationsCellDeclaration = defineOperation<
  ListInvitationsInput,
  InvitationPage,
  ControlWorkforceFailure
>({
  kind: "query",
  id: "control.list-invitations.v1",
  contract: listControlInvitationsContract,
  authorization: readAuthorization,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [listInvitationsSurface],
  observability: { operation: "control.list_invitations" },
})
