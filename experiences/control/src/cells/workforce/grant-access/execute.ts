import type { AccessManagementExecute } from "../../../management/model/dependencies.ts"
import type { GrantProjection } from "../../../management/workforce/contracts.ts"
import { workforceFailure } from "../../../management/model/failure.ts"
import { grantControlAccessCellDeclaration } from "./cell.ts"
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

export const makeGrantControlAccessCell = (
  access: AccessManagementExecute<"grantWorkforceAccess">,
) =>
  bindCell(grantControlAccessCellDeclaration, async (input) => {
    const outcome = await access.execute({
      actor: input.context.actor,
      businessId: input.context.access.business.id,
      membershipId: input.membershipId,
      identityId: input.identityId,
      role: input.role,
      scope: input.scope,
      ...(input.startsAt === undefined ? {} : { startsAt: input.startsAt }),
      ...(input.endsAt === undefined ? {} : { endsAt: input.endsAt }),
      idempotencyKey: input.idempotencyKey,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: workforceFailure(outcome.failure) }
      : { kind: "success", value: projectControlGrant(outcome.value) }
  })
