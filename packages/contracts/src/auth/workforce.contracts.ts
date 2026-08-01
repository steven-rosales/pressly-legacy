import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';

const idempotencyKeySchema = z.string().trim().min(8).max(200);
const reasonNoteSchema = z.string().trim().min(1).max(1_000).nullable();

export const businessAccountStatusSchema = z.enum(['active', 'suspended']);

export const businessAccountSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    displayName: z.string().trim().min(1).max(200),
    status: businessAccountStatusSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const businessAccountParamsSchema = z
  .object({ businessId: z.uuid() })
  .strict();

export const workforceRoleSchema = z.enum(['owner', 'manager', 'operator']);
export const workforceMembershipStateSchema = z.enum([
  'active',
  'suspended',
  'ended',
]);
export const workforceInvitationStateSchema = z.enum([
  'pending',
  'accepted',
  'revoked',
  'expired',
]);
export const accessGrantStateSchema = z.enum(['active', 'revoked', 'expired']);

export const accessScopeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('business'),
      businessId: z.uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('location'),
      businessId: z.uuid(),
      locationId: z.string().trim().min(1).max(200),
    })
    .strict(),
  z
    .object({
      kind: z.literal('resource'),
      businessId: z.uuid(),
      resourceType: z.string().trim().min(1).max(100),
      resourceId: z.string().trim().min(1).max(200),
    })
    .strict(),
]);

export const workforceMembershipSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),
    identityId: z.uuid(),
    displayName: z.string().trim().min(1),
    email: z.email(),
    state: workforceMembershipStateSchema,
    version: z.number().int().positive(),
    startedAt: utcIsoStringSchema,
    suspendedAt: utcIsoStringSchema.nullable(),
    endedAt: utcIsoStringSchema.nullable(),
  })
  .strict();

export const workforceInvitationSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),
    email: z.email(),
    displayName: z.string().trim().min(1),
    intendedRole: workforceRoleSchema,
    intendedLocationId: z.string().trim().min(1).nullable(),
    state: workforceInvitationStateSchema,
    version: z.number().int().positive(),
    expiresAt: utcIsoStringSchema,
    acceptedAt: utcIsoStringSchema.nullable(),
    revokedAt: utcIsoStringSchema.nullable(),
    expiredAt: utcIsoStringSchema.nullable(),
    createdAt: utcIsoStringSchema,
  })
  .strict();

export const accessGrantSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),
    membershipId: z.uuid(),
    identityId: z.uuid(),
    role: workforceRoleSchema,
    scope: accessScopeSchema,
    state: accessGrantStateSchema,
    version: z.number().int().positive(),
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema.nullable(),
  })
  .strict();

export const workforceTeamResultSchema = z
  .object({
    business: businessAccountSchema,
    memberships: z.array(workforceMembershipSchema),
    invitations: z.array(workforceInvitationSchema),
    grants: z.array(accessGrantSchema),
  })
  .strict();

export const issueWorkforceInvitationRequestSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    email: z.email(),
    displayName: z.string().trim().min(1).max(200),
    intendedRole: workforceRoleSchema,
    intendedLocationId: z.string().trim().min(1).max(200).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.intendedRole === 'operator' && value.intendedLocationId === null)
      context.addIssue({
        code: 'custom',
        path: ['intendedLocationId'],
        message: 'Operators require a location.',
      });
  });

/**
 * The acceptance token is returned only on first issue for deliberate
 * delivery. Persistence stores only a keyed HMAC digest, and callers must not
 * place the raw token in logs or browser storage.
 */
export const issueWorkforceInvitationResultSchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        status: z.literal('issued'),
        invitation: workforceInvitationSchema,
        acceptanceToken: z.string().min(32),
        replayed: z.literal(false),
      })
      .strict(),
    z
      .object({
        status: z.literal('replayed'),
        invitation: workforceInvitationSchema,
        replayed: z.literal(true),
      })
      .strict(),
  ],
);

export const acceptWorkforceInvitationRequestSchema = z.discriminatedUnion(
  'identityMode',
  [
    z
      .object({
        identityMode: z.literal('existing_identity'),
        idempotencyKey: idempotencyKeySchema,
        acceptanceToken: z.string().min(32).max(512),
      })
      .strict(),
    z
      .object({
        identityMode: z.literal('new_identity'),
        idempotencyKey: idempotencyKeySchema,
        acceptanceToken: z.string().min(32).max(512),
        // This boundary validates transport shape. The Auth use case owns and
        // enforces the canonical password-strength policy.
        password: z.string().min(1).max(256),
      })
      .strict(),
  ],
);

export const acceptWorkforceInvitationResultSchema = z
  .object({
    invitationId: z.uuid(),
    membershipId: z.uuid(),
    identityId: z.uuid(),
    state: z.literal('accepted'),
    replayed: z.boolean(),
  })
  .strict();

export const workforceInvitationParamsSchema = businessAccountParamsSchema
  .extend({ invitationId: z.uuid() })
  .strict();

export const workforceMembershipParamsSchema = businessAccountParamsSchema
  .extend({ membershipId: z.uuid() })
  .strict();

export const accessGrantParamsSchema = businessAccountParamsSchema
  .extend({ grantId: z.uuid() })
  .strict();

export const revokeWorkforceInvitationRequestSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    expectedVersion: z.number().int().positive(),
    reasonCode: z.enum(['invitation_replaced', 'access_no_longer_needed']),
    reasonNote: reasonNoteSchema,
  })
  .strict();

const membershipTransitionRequestSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    expectedVersion: z.number().int().positive(),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const suspendWorkforceMembershipRequestSchema =
  membershipTransitionRequestSchema.extend({
    reasonCode: z.enum([
      'temporary_leave',
      'security_review',
      'manager_suspended',
    ]),
  });

export const reactivateWorkforceMembershipRequestSchema =
  membershipTransitionRequestSchema.extend({
    reasonCode: z.enum(['returned_to_work', 'security_review_cleared']),
  });

export const endWorkforceMembershipRequestSchema =
  membershipTransitionRequestSchema.extend({
    reasonCode: z.enum([
      'employment_ended',
      'duplicate_membership',
      'created_in_error',
    ]),
  });

export const createAccessGrantRequestSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    membershipId: z.uuid(),
    role: workforceRoleSchema,
    scope: accessScopeSchema,
    startsAt: utcIsoStringSchema.nullable().optional(),
    endsAt: utcIsoStringSchema.nullable().optional(),
    reasonCode: z.enum(['initial_access', 'responsibility_changed']),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const revokeAccessGrantRequestSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    expectedVersion: z.number().int().positive(),
    reasonCode: z.enum([
      'responsibility_changed',
      'membership_suspended',
      'membership_ended',
      'security_review',
    ]),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const workforceTransitionResultSchema = z
  .object({
    aggregateId: z.uuid(),
    state: z.enum([
      'accepted',
      'revoked',
      'expired',
      'active',
      'suspended',
      'ended',
    ]),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export const accessGrantMutationResultSchema = z
  .object({
    grant: accessGrantSchema,
    replayed: z.boolean(),
  })
  .strict();

export type BusinessAccount = z.infer<typeof businessAccountSchema>;
export type WorkforceRole = z.infer<typeof workforceRoleSchema>;
export type WorkforceMembership = z.infer<typeof workforceMembershipSchema>;
export type WorkforceInvitation = z.infer<typeof workforceInvitationSchema>;
export type AccessGrant = z.infer<typeof accessGrantSchema>;
export type AccessScope = z.infer<typeof accessScopeSchema>;
export type IssueWorkforceInvitationRequest = z.infer<
  typeof issueWorkforceInvitationRequestSchema
>;
export type AcceptWorkforceInvitationRequest = z.infer<
  typeof acceptWorkforceInvitationRequestSchema
>;
export type CreateAccessGrantRequest = z.infer<
  typeof createAccessGrantRequestSchema
>;
export type RevokeAccessGrantRequest = z.infer<
  typeof revokeAccessGrantRequestSchema
>;
