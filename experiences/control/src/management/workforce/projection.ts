import type {
  GrantProjection,
  InvitationProjection,
  MemberDetail,
  MemberProjection,
} from "./contracts.ts"

export type RawGrant = Readonly<{
  id: string
  businessId: string
  membershipId: string
  identityId: string
  role: "owner" | "manager" | "operator"
  scope: Readonly<{ kind: "business" | "location"; id: string }>
  state: "active" | "revoked" | "expired"
  version: number
  startsAt: Date | null
  endsAt: Date | null
  effective: boolean
}>

export type RawMember = Readonly<{
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

export type RawMemberDetail = RawMember &
  Readonly<{
    activeSessionCount: number
    createdAt: Date
    updatedAt: Date
  }>

export type RawInvitation = Readonly<{
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
