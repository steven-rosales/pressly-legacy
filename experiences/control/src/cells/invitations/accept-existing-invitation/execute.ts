import type { AccessExecute } from "../../../auth/model/access.ts"
import type { InvitationAcceptance } from "../../../management/invitations/contracts.ts"
import {
  invitationModeFailure,
  invitationPeerFailure,
} from "../../../management/invitations/failure.ts"
import { acceptExistingControlInvitationCellDeclaration } from "./cell.ts"
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

export const makeAcceptExistingControlInvitationCell = (
  access: AcceptExecute,
) =>
  defineOperation(
    acceptExistingControlInvitationCellDeclaration,
    async (input) => {
      if (input.identityMode !== "existing_identity")
        return {
          kind: "failure",
          failure: invitationModeFailure(
            "Existing identity acceptance requires existing_identity mode.",
          ),
        }
      const outcome = await access.execute({
        rawToken: input.acceptanceToken,
        idempotencyKey: input.idempotencyKey,
        acceptance: {
          kind: "existing_identity",
          authenticatedIdentityId: input.context.actor.identityId,
          authenticatedSessionId: input.context.actor.sessionId,
        },
      })
      return outcome.kind === "failure"
        ? { kind: "failure", failure: invitationPeerFailure(outcome.failure) }
        : { kind: "success", value: projectAcceptance(outcome.value) }
    },
  )
