import type { AccessManagementExecute } from "../../../management/model/dependencies.ts"
import type {
  InvitationProjection,
  IssueInvitationOutput,
} from "../../../management/workforce/contracts.ts"
import { workforceFailure } from "../../../management/model/failure.ts"
import { reissueControlInvitationCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

type RawInvitation = Readonly<{
  id: string
  businessId: string
  emailNormalized: string
  displayName: string
  intendedRole: "owner" | "manager" | "operator"
  intendedLocationId: string | null
  state: "pending" | "accepted" | "revoked" | "expired"
  version: number
  expiresAt: Date
  createdAt: Date
}>

export const projectControlInvitation = (
  invitation: RawInvitation,
): InvitationProjection => ({
  id: invitation.id,
  businessId: invitation.businessId,
  email: invitation.emailNormalized,
  displayName: invitation.displayName,
  intendedRole: invitation.intendedRole,
  intendedLocationId: invitation.intendedLocationId,
  state: invitation.state,
  version: invitation.version,
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
})

const invitationIssueProjection = (
  outcome:
    | Readonly<{
        status: "issued"
        invitation: RawInvitation
        token: string
      }>
    | Readonly<{
        status: "replayed"
        invitation: RawInvitation
      }>,
): IssueInvitationOutput =>
  outcome.status === "issued"
    ? {
        status: "issued",
        invitation: projectControlInvitation(outcome.invitation),
        acceptanceToken: outcome.token,
      }
    : {
        status: "replayed",
        invitation: projectControlInvitation(outcome.invitation),
      }

export const makeReissueControlInvitationCell = (
  access: AccessManagementExecute<"reissueWorkforceInvitation">,
) =>
  bindCell(reissueControlInvitationCellDeclaration, async (input) => {
    const outcome = await access.execute({
      actor: input.context.actor,
      businessId: input.context.access.business.id,
      invitationId: input.invitationId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: workforceFailure(outcome.failure) }
      : { kind: "success", value: invitationIssueProjection(outcome.value) }
  })
