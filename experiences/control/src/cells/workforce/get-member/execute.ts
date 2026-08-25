import type { AccessManagementExecute } from "../../../management/model/dependencies.ts"
import type {
  GrantProjection,
  MemberDetail,
  MemberProjection,
} from "../../../management/workforce/contracts.ts"
import { workforceFailure } from "../../../management/model/failure.ts"
import { getControlMemberCellDeclaration } from "./cell.ts"
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

type RawMember = Readonly<{
  membershipId: string
  businessId: string
  identityId: string
  displayName: string
  email: string
  state: "active" | "suspended" | "ended"
  version: number
  mfaEnabled: boolean
  grants: readonly RawGrant[]
  startedAt: Date
  suspendedAt: Date | null
  endedAt: Date | null
}>

type RawMemberDetail = RawMember &
  Readonly<{
    activeSessionCount: number
    createdAt: Date
    updatedAt: Date
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

export const projectControlMember = (member: RawMember): MemberProjection => ({
  membershipId: member.membershipId,
  businessId: member.businessId,
  identityId: member.identityId,
  displayName: member.displayName,
  email: member.email,
  state: member.state,
  version: member.version,
  mfaEnabled: member.mfaEnabled,
  grants: member.grants.map(projectControlGrant),
  startedAt: member.startedAt,
  suspendedAt: member.suspendedAt,
  endedAt: member.endedAt,
})

export const projectControlMemberDetail = (
  member: RawMemberDetail,
): MemberDetail => ({
  ...projectControlMember(member),
  activeSessionCount: member.activeSessionCount,
  createdAt: member.createdAt,
  updatedAt: member.updatedAt,
})

export const makeGetControlMemberCell = (
  access: AccessManagementExecute<"getWorkforceMember">,
) =>
  bindCell(getControlMemberCellDeclaration, async (input) => {
    const outcome = await access.execute({
      actor: input.context.actor,
      businessId: input.context.access.business.id,
      membershipId: input.membershipId,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: workforceFailure(outcome.failure) }
      : { kind: "success", value: projectControlMemberDetail(outcome.value) }
  })
