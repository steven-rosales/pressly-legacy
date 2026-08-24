import { z } from "zod"
import { utcDateSchema } from "../model/boundary.ts"
import { controlManagementContextSchema } from "../model/context.ts"

export const workforceRoleSchema = z.enum(["owner", "manager", "operator"])
export const workforceScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("business"), id: z.uuid() }).strict(),
  z
    .object({
      kind: z.literal("location"),
      id: z.string().trim().min(1).max(200),
    })
    .strict(),
])
const membershipStateSchema = z.enum(["active", "suspended", "ended"])
const invitationStateSchema = z.enum([
  "pending",
  "accepted",
  "revoked",
  "expired",
])
const grantStateSchema = z.enum(["active", "revoked", "expired"])

export const workforceListQuerySchema = z
  .object({
    state: z
      .union([membershipStateSchema, z.array(membershipStateSchema)])
      .optional(),
    query: z.string().trim().max(120).optional(),
    cursor: z.string().trim().min(1).max(1_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
export const invitationListQuerySchema = z
  .object({
    includeTerminal: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .default(false),
    cursor: z.string().trim().min(1).max(1_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
export const membershipParamsSchema = z
  .object({ membershipId: z.uuid() })
  .strict()
export const invitationParamsSchema = z
  .object({ invitationId: z.uuid() })
  .strict()
export const grantParamsSchema = z.object({ grantId: z.uuid() }).strict()

export const membershipMutationBodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict()
export const revokeSessionsBodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    sessionId: z.uuid().optional(),
  })
  .strict()
export const issueInvitationBodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    email: z.email(),
    displayName: z.string().trim().min(1).max(200),
    intendedRole: workforceRoleSchema,
    intendedLocationId: z.string().trim().min(1).max(200).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.intendedRole === "operator" && value.intendedLocationId === null)
      context.addIssue({
        code: "custom",
        path: ["intendedLocationId"],
        message: "Operators require a location.",
      })
  })
export const grantAccessBodySchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    identityId: z.uuid(),
    role: workforceRoleSchema,
    scope: workforceScopeSchema,
    startsAt: utcDateSchema.optional(),
    endsAt: utcDateSchema.optional(),
  })
  .strict()

export const grantProjectionSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),
    membershipId: z.uuid(),
    identityId: z.uuid(),
    role: workforceRoleSchema,
    scope: workforceScopeSchema,
    state: grantStateSchema,
    version: z.number().int().positive(),
    startsAt: utcDateSchema.nullable(),
    endsAt: utcDateSchema.nullable(),
    effective: z.boolean(),
  })
  .strict()
export const memberProjectionSchema = z
  .object({
    membershipId: z.uuid(),
    businessId: z.uuid(),
    identityId: z.uuid(),
    displayName: z.string().trim().min(1).max(200),
    email: z.email().max(320),
    state: membershipStateSchema,
    version: z.number().int().positive(),
    mfaEnabled: z.boolean(),
    grants: z.array(grantProjectionSchema).max(100),
    startedAt: utcDateSchema,
    suspendedAt: utcDateSchema.nullable(),
    endedAt: utcDateSchema.nullable(),
  })
  .strict()
export const memberDetailSchema = memberProjectionSchema
  .extend({
    activeSessionCount: z.number().int().nonnegative(),
    createdAt: utcDateSchema,
    updatedAt: utcDateSchema,
  })
  .strict()
export const memberPageSchema = z
  .object({
    members: z.array(memberProjectionSchema).max(100),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict()
export const invitationProjectionSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),
    email: z.email().max(320),
    displayName: z.string().trim().min(1).max(200),
    intendedRole: workforceRoleSchema,
    intendedLocationId: z.string().trim().min(1).max(200).nullable(),
    state: invitationStateSchema,
    version: z.number().int().positive(),
    expiresAt: utcDateSchema,
    createdAt: utcDateSchema,
  })
  .strict()
export const invitationPageSchema = z
  .object({
    invitations: z.array(invitationProjectionSchema).max(100),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict()
export const issueInvitationOutputSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("issued"),
      invitation: invitationProjectionSchema,
      acceptanceToken: z.string().min(32).max(512),
    })
    .strict(),
  z
    .object({
      status: z.literal("replayed"),
      invitation: invitationProjectionSchema,
    })
    .strict(),
])
export const membershipTransitionOutputSchema = z
  .object({
    member: memberDetailSchema,
    revokedSessionCount: z.number().int().nonnegative(),
  })
  .strict()
export const revokeAccessOutputSchema = z
  .object({
    grant: grantProjectionSchema,
    revokedSessionCount: z.number().int().nonnegative(),
  })
  .strict()
const canonicalIsoStringSchema = z.string().refine((value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}, "Expected a canonical UTC ISO datetime.")
export const sessionListSchema = z
  .object({
    sessions: z
      .array(
        z
          .object({
            id: z.uuid(),
            issuedAt: canonicalIsoStringSchema,
            lastUsedAt: canonicalIsoStringSchema,
            expiresAt: canonicalIsoStringSchema,
            revokedAt: canonicalIsoStringSchema.nullable(),
            current: z.boolean(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
export const sessionRevocationSchema = z
  .object({
    revokedCount: z.number().int().nonnegative(),
    replayed: z.boolean(),
  })
  .strict()

const withContext = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object({ context: controlManagementContextSchema, ...shape }).strict()

export const listMembersInputSchema = withContext({
  states: z.array(membershipStateSchema).optional(),
  query: z.string().trim().max(120).optional(),
  cursor: z.string().trim().min(1).max(1_000).optional(),
  limit: z.number().int().min(1).max(100),
})
export const memberInputSchema = withContext({ membershipId: z.uuid() })
export const revokeSessionsInputSchema = withContext({
  membershipId: z.uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  sessionId: z.uuid().optional(),
})
export const listInvitationsInputSchema = withContext({
  includeTerminal: z.boolean(),
  cursor: z.string().trim().min(1).max(1_000).optional(),
  limit: z.number().int().min(1).max(100),
})
export const issueInvitationInputSchema = issueInvitationBodySchema
  .extend({ context: controlManagementContextSchema })
  .strict()
export const invitationMutationInputSchema = membershipMutationBodySchema
  .extend({
    context: controlManagementContextSchema,
    invitationId: z.uuid(),
  })
  .strict()
export const membershipTransitionInputSchema = membershipMutationBodySchema
  .extend({
    context: controlManagementContextSchema,
    membershipId: z.uuid(),
  })
  .strict()
export const grantAccessInputSchema = grantAccessBodySchema
  .extend({
    context: controlManagementContextSchema,
    membershipId: z.uuid(),
  })
  .strict()
export const revokeAccessInputSchema = membershipMutationBodySchema
  .extend({ context: controlManagementContextSchema, grantId: z.uuid() })
  .strict()

export type ListMembersInput = z.output<typeof listMembersInputSchema>
export type MemberInput = z.output<typeof memberInputSchema>
export type RevokeSessionsInput = z.output<typeof revokeSessionsInputSchema>
export type ListInvitationsInput = z.output<typeof listInvitationsInputSchema>
export type IssueInvitationInput = z.output<typeof issueInvitationInputSchema>
export type InvitationMutationInput = z.output<
  typeof invitationMutationInputSchema
>
export type MembershipTransitionInput = z.output<
  typeof membershipTransitionInputSchema
>
export type GrantAccessInput = z.output<typeof grantAccessInputSchema>
export type RevokeAccessInput = z.output<typeof revokeAccessInputSchema>
export type GrantProjection = z.output<typeof grantProjectionSchema>
export type MemberProjection = z.output<typeof memberProjectionSchema>
export type MemberDetail = z.output<typeof memberDetailSchema>
export type MemberPage = z.output<typeof memberPageSchema>
export type InvitationProjection = z.output<typeof invitationProjectionSchema>
export type InvitationPage = z.output<typeof invitationPageSchema>
export type IssueInvitationOutput = z.output<typeof issueInvitationOutputSchema>
export type MembershipTransitionOutput = z.output<
  typeof membershipTransitionOutputSchema
>
export type RevokeAccessOutput = z.output<typeof revokeAccessOutputSchema>
export type SessionList = z.output<typeof sessionListSchema>
export type SessionRevocation = z.output<typeof sessionRevocationSchema>
