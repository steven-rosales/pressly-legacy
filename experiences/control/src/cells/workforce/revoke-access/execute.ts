import type { AccessManagementExecute } from "../../../management/model/dependencies.ts"
import type { GrantProjection } from "../../../management/workforce/contracts.ts"
import { workforceFailure } from "../../../management/model/failure.ts"
import { revokeControlAccessCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

type RawGrant = Readonly<{
  id: string
  businessId: string
  membershipId: string
  identityId: string
  role: "owner" | "manager" | "operator"
  scope: Readonly<{
    kind: "business" | "location"
    id: string
  }>
  state: "active" | "revoked" | "expired"
  version: number
  startsAt: Date | null
  endsAt: Date | null
  effective: boolean
}>

export const projectControlGrant = (grant: RawGrant): GrantProjection => ({
  id: grant.id,
  businessId: grant.businessId,
  membershipId: grant.membershipId,
  identityId: grant.identityId,
  role: grant.role,
  scope: { kind: grant.scope.kind, id: grant.scope.id },
  state: grant.state,
  version: grant.version,
  startsAt: grant.startsAt,
  endsAt: grant.endsAt,
  effective: grant.effective,
})

export const makeRevokeControlAccessCell = (
  access: AccessManagementExecute<"revokeWorkforceAccess">,
) =>
  bindCell(revokeControlAccessCellDeclaration, async (input) => {
    const outcome = await access.execute({
      actor: input.context.actor,
      businessId: input.context.access.business.id,
      grantId: input.grantId,
      expectedVersion: input.expectedVersion,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      idempotencyKey: input.idempotencyKey,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: workforceFailure(outcome.failure) }
      : {
          kind: "success",
          value: {
            grant: projectControlGrant(outcome.value.grant),
            revokedSessionCount: outcome.value.revokedSessionCount,
          },
        }
  })
