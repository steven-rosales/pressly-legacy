import type { AccessExecute } from "../../../auth/model/access.ts"
import type { InvitationAcceptance } from "../../../management/invitations/contracts.ts"
import {
  invitationModeFailure,
  invitationPeerFailure,
} from "../../../management/invitations/failure.ts"
import { acceptNewControlInvitationCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

type AcceptExecute = AccessExecute<"acceptWorkforceInvitation">

type RawAcceptance = Extract<
  Awaited<ReturnType<AcceptExecute["execute"]>>,
  Readonly<{
    kind: "success"
  }>
>["value"]

const projectAcceptance = (value: RawAcceptance): InvitationAcceptance => ({
  invitationId: value.invitation.id,
  membershipId: value.membershipId,
  identityId: value.identityId,
  identityCreated: value.identityCreated,
  privilegedAccessEffective: value.privilegedAccessEffective,
  replayed: value.replayed,
})

export const makeAcceptNewControlInvitationCell = (access: AcceptExecute) =>
  defineOperation(acceptNewControlInvitationCellDeclaration, async (input) => {
    if (input.identityMode !== "new_identity")
      return {
        kind: "failure",
        failure: invitationModeFailure(
          "New identity acceptance requires new_identity mode.",
        ),
      }
    const outcome = await access.execute({
      rawToken: input.acceptanceToken,
      idempotencyKey: input.idempotencyKey,
      acceptance: { kind: "new_identity", password: input.password },
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: invitationPeerFailure(outcome.failure) }
      : { kind: "success", value: projectAcceptance(outcome.value) }
  })
