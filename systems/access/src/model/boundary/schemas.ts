import { z } from 'zod';
import { isUtcIso, utcIsoFromDate } from '@pressly/time';

const utcIsoSchema = z
  .string()
  .refine((value): boolean => isUtcIso(value), 'Expected a UTC ISO datetime.');

export const utcDateSchema = z.codec(utcIsoSchema, z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => utcIsoFromDate(value),
});

export const workforceRoleSchema = z.enum(['owner', 'manager', 'operator']);

export const workforceScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('business'), id: z.string() }).strict(),
  z.object({ kind: z.literal('location'), id: z.string() }).strict(),
]);

export const workforceActorSchema = z
  .object({ identityId: z.string(), sessionId: z.string() })
  .strict();

export const workforceFailureSchema = z
  .object({
    kind: z.enum([
      'validation',
      'authentication',
      'permission',
      'not_found',
      'conflict',
    ]),
    code: z.string(),
    message: z.string(),
    details: z
      .object({
        field: z.string().optional(),
        currentVersion: z.number().optional(),
        violations: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const accessGrantSchema = z
  .object({
    id: z.string(),
    businessId: z.string(),
    membershipId: z.string(),
    identityId: z.string(),
    role: workforceRoleSchema,
    scope: workforceScopeSchema,
    state: z.enum(['active', 'revoked', 'expired']),
    version: z.number(),
    startsAt: utcDateSchema.nullable(),
    endsAt: utcDateSchema.nullable(),
    effective: z.boolean(),
  })
  .strict();

export const workforceInvitationSchema = z
  .object({
    id: z.string(),
    businessId: z.string(),
    emailNormalized: z.string(),
    displayName: z.string(),
    intendedRole: workforceRoleSchema,
    intendedLocationId: z.string().nullable(),
    state: z.enum(['pending', 'accepted', 'revoked', 'expired']),
    version: z.number(),
    expiresAt: utcDateSchema,
    createdAt: utcDateSchema,
  })
  .strict();

export const workforceInvitationPreviewSchema = z
  .object({
    invitationId: z.string(),
    businessId: z.string(),
    businessName: z.string(),
    emailNormalized: z.string(),
    displayName: z.string(),
    intendedRole: workforceRoleSchema,
    intendedLocationId: z.string().nullable(),
    expiresAt: utcDateSchema,
    existingIdentity: z.boolean(),
  })
  .strict();

export const workforceMembershipSchema = z
  .object({
    membershipId: z.string(),
    businessId: z.string(),
    identityId: z.string(),
    state: z.enum(['active', 'suspended', 'ended']),
    version: z.number(),
    startedAt: utcDateSchema,
    suspendedAt: utcDateSchema.nullable(),
    endedAt: utcDateSchema.nullable(),
  })
  .strict();

export const workforceMemberSummarySchema = workforceMembershipSchema.extend({
  displayName: z.string(),
  email: z.string(),
  mfaEnabled: z.boolean(),
  grants: z.array(accessGrantSchema),
});

export const workforceMemberDetailSchema = workforceMemberSummarySchema.extend({
  activeSessionCount: z.number(),
  createdAt: utcDateSchema,
  updatedAt: utcDateSchema,
});

export const workforcePageSchema = z
  .object({
    members: z.array(workforceMemberSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const mfaFailureSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('authentication'),
      code: z.enum([
        'invalid_mfa_challenge',
        'expired_mfa_challenge',
        'invalid_mfa_code',
      ]),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      code: z.enum(['mfa_already_enabled', 'mfa_enrollment_missing']),
      message: z.string(),
    })
    .strict(),
]);

export const authenticatedPrincipalSchema = z
  .object({
    identityId: z.string(),
    displayName: z.string(),
    email: z.string().optional(),
    audience: z.literal('customer').optional(),
    customerId: z.string().optional(),
    roles: z.array(workforceRoleSchema),
  })
  .strict()
  .superRefine((principal, context) => {
    if (
      (principal.audience === 'customer') !==
      (principal.customerId !== undefined)
    )
      context.addIssue({
        code: 'custom',
        path: ['audience'],
        message: 'Customer audience and customer ID must be present together.',
      });
  });

export const authenticatedSessionSchema = z
  .object({
    accessToken: z.string(),
    expiresAt: utcDateSchema,
    principal: authenticatedPrincipalSchema,
  })
  .strict();

export const authScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('global'), id: z.literal('*') }).strict(),
  z.object({ kind: z.literal('business'), id: z.string() }).strict(),
  z.object({ kind: z.literal('location'), id: z.string() }).strict(),
  z
    .object({ kind: z.literal('resource'), type: z.string(), id: z.string() })
    .strict(),
]);

export const roleAssignmentSchema = z
  .object({
    role: workforceRoleSchema,
    scope: authScopeSchema,
    state: z.enum(['active', 'revoked', 'expired']),
    version: z.number(),
    startsAt: utcDateSchema.optional(),
    endsAt: utcDateSchema.optional(),
  })
  .strict();

export const loadedSessionSchema = z
  .object({
    principal: z
      .object({
        identityId: z.string(),
        kind: z.enum(['human', 'service']),
        displayName: z.string(),
        email: z.string().optional(),
        audience: z.literal('customer').optional(),
        customerId: z.string().optional(),
        sessionId: z.string().optional(),
        sessionIssuedAt: utcDateSchema.optional(),
        sessionExpiresAt: utcDateSchema.optional(),
      })
      .strict()
      .superRefine((principal, context) => {
        if (
          (principal.audience === 'customer') !==
          (principal.customerId !== undefined)
        )
          context.addIssue({
            code: 'custom',
            path: ['audience'],
            message:
              'Customer audience and customer ID must be present together.',
          });
      }),
    principalAttributes: z
      .object({
        assignments: z.array(roleAssignmentSchema),
        identityActive: z.boolean(),
        assuranceLevel: z.enum(['password', 'mfa', 'service_key']).optional(),
      })
      .strict(),
  })
  .strict();

export const noExpectedFailureSchema = z.never();
