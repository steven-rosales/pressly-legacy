import {
  controlAccessGrantProjectionSchema,
  controlGrantAccessResultSchema,
  controlInvitationMutationResultSchema,
  controlIssueInvitationResultSchema,
  controlMembershipMutationResultSchema,
  controlRevokeAccessResultSchema,
  controlWorkforceInvitationPageSchema,
  controlWorkforceInvitationProjectionSchema,
  controlWorkforceMemberDetailProjectionSchema,
  controlWorkforceMemberPageSchema,
  controlWorkforceMemberProjectionSchema,
  controlWorkforceSessionListSchema,
  controlWorkforceSessionRevokeResultSchema,
  controlWorkforceSessionSchema,
  workforceInvitationStateSchema as sharedWorkforceInvitationStateSchema,
  workforceMembershipStateSchema as sharedWorkforceMembershipStateSchema,
  workforceRoleSchema as sharedWorkforceRoleSchema,
  type ControlAccessGrantProjection,
  type ControlIssueInvitationResult,
  type ControlWorkforceInvitationProjection,
  type ControlWorkforceMemberDetailProjection,
  type ControlWorkforceMemberProjection,
  type ControlWorkforceSession,
  type WorkforceRole as SharedWorkforceRole,
} from "@pressly/contracts"

export const workforceRoleSchema = sharedWorkforceRoleSchema
export const workforceMembershipStateSchema =
  sharedWorkforceMembershipStateSchema
export const workforceInvitationStateSchema =
  sharedWorkforceInvitationStateSchema

export const accessGrantSchema = controlAccessGrantProjectionSchema
export const workforceMemberSchema = controlWorkforceMemberProjectionSchema
export const workforceMemberDetailSchema =
  controlWorkforceMemberDetailProjectionSchema
export const workforceInvitationSchema =
  controlWorkforceInvitationProjectionSchema
export const workforcePageSchema = controlWorkforceMemberPageSchema
export const workforceInvitationPageSchema =
  controlWorkforceInvitationPageSchema
export const issueInvitationResultSchema = controlIssueInvitationResultSchema
export const invitationMutationResultSchema =
  controlInvitationMutationResultSchema
export const membershipMutationResultSchema =
  controlMembershipMutationResultSchema
export const grantAccessResultSchema = controlGrantAccessResultSchema
export const revokeAccessResultSchema = controlRevokeAccessResultSchema
export const workforceSessionSchema = controlWorkforceSessionSchema
export const workforceSessionListSchema = controlWorkforceSessionListSchema
export const workforceSessionRevokeResultSchema =
  controlWorkforceSessionRevokeResultSchema

export type WorkforceRole = SharedWorkforceRole
export type WorkforceMember = ControlWorkforceMemberProjection
export type WorkforceMemberDetail = ControlWorkforceMemberDetailProjection
export type WorkforceInvitation = ControlWorkforceInvitationProjection
export type AccessGrant = ControlAccessGrantProjection
export type WorkforceSession = ControlWorkforceSession
export type IssueInvitationResult = ControlIssueInvitationResult
