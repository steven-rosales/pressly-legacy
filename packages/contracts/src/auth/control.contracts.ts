import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';
import { processorCompleteMfaChallengeRequestSchema } from './auth.contracts.ts';
import {
  accessGrantStateSchema,
  workforceInvitationStateSchema,
  workforceMembershipStateSchema,
  workforceRoleSchema,
} from './workforce.contracts.ts';

export const controlCapabilitySchema = z.enum([
  'control:view',
  'team:read',
  'team:write',
  'customers:read',
  'customers:write',
  'orders:read',
  'orders:write',
  'security:read',
  'security:write',
  'auth:mfa:enroll',
  'processor:view',
]);

export const presslyApplicationSchema = z
  .object({
    id: z.enum(['processor', 'control']),
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(160),
    href: z
      .url()
      .max(300)
      .refine((href) => {
        const url = new URL(href);
        return (
          (url.protocol === 'https:' || url.protocol === 'http:') &&
          url.username.length === 0 &&
          url.password.length === 0 &&
          url.pathname === '/' &&
          url.search.length === 0 &&
          url.hash.length === 0
        );
      }, 'Application destinations must be origin-only HTTP(S) URLs.'),
  })
  .strict();

const controlCapabilityListSchema = z
  .array(controlCapabilitySchema)
  .max(controlCapabilitySchema.options.length)
  .refine(
    (capabilities) => new Set(capabilities).size === capabilities.length,
    'Control capabilities must be unique.',
  );

const presslyApplicationListSchema = z
  .array(presslyApplicationSchema)
  .max(2)
  .refine(
    (applications) =>
      new Set(applications.map((application) => application.id)).size ===
      applications.length,
    'Application destinations must be unique.',
  );

export const controlAuthenticatedSessionSchema = z
  .object({
    status: z.literal('authenticated'),
    principal: z
      .object({
        identityId: z.uuid(),
        displayName: z.string().trim().min(1).max(200),
        email: z.email().optional(),
      })
      .strict(),
    access: z
      .object({
        business: z
          .object({
            id: z.uuid(),
            name: z.string().trim().min(1).max(200),
          })
          .strict(),
        locations: z
          .array(
            z
              .object({
                id: z.string().trim().min(1).max(200),
                name: z.string().trim().min(1).max(200),
                timezone: z.string().trim().min(1).max(100),
              })
              .strict(),
          )
          .max(100),
        selectedLocationId: z.string().trim().min(1).max(200).nullable(),
        capabilities: controlCapabilityListSchema,
        applications: presslyApplicationListSchema,
      })
      .strict(),
    expiresAt: utcIsoStringSchema,
    csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

export const controlMfaChallengeSchema = z
  .object({
    status: z.literal('mfa_required'),
    methods: z.tuple([z.literal('totp'), z.literal('recovery')]),
  })
  .strict();

export const controlLoginResultSchema = z.discriminatedUnion('status', [
  controlAuthenticatedSessionSchema,
  controlMfaChallengeSchema,
]);

export const controlWorkforceListQuerySchema = z
  .object({
    state: z
      .union([
        z.enum(['active', 'suspended', 'ended']),
        z.array(z.enum(['active', 'suspended', 'ended'])),
      ])
      .optional(),
    query: z.string().trim().max(120).optional(),
    cursor: z.string().trim().min(1).max(1_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const controlInvitationListQuerySchema = z
  .object({
    includeTerminal: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(false),
    cursor: z.string().trim().min(1).max(1_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const controlAccessGrantProjectionSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),
    membershipId: z.uuid(),
    identityId: z.uuid(),
    role: workforceRoleSchema,
    scope: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('business'), id: z.uuid() }).strict(),
      z
        .object({
          kind: z.literal('location'),
          id: z.string().trim().min(1).max(200),
        })
        .strict(),
    ]),
    state: accessGrantStateSchema,
    version: z.number().int().positive(),
    startsAt: utcIsoStringSchema.nullable(),
    endsAt: utcIsoStringSchema.nullable(),
    effective: z.boolean(),
  })
  .strict();

export const controlWorkforceMemberProjectionSchema = z
  .object({
    membershipId: z.uuid(),
    businessId: z.uuid(),
    identityId: z.uuid(),
    displayName: z.string().trim().min(1).max(200),
    email: z.email().max(320),
    state: workforceMembershipStateSchema,
    version: z.number().int().positive(),
    mfaEnabled: z.boolean(),
    grants: z.array(controlAccessGrantProjectionSchema).max(100),
    startedAt: utcIsoStringSchema,
    suspendedAt: utcIsoStringSchema.nullable(),
    endedAt: utcIsoStringSchema.nullable(),
  })
  .strict();

export const controlWorkforceMemberDetailProjectionSchema =
  controlWorkforceMemberProjectionSchema
    .extend({
      activeSessionCount: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER),
      createdAt: utcIsoStringSchema,
      updatedAt: utcIsoStringSchema,
    })
    .strict();

export const controlWorkforceInvitationProjectionSchema = z
  .object({
    id: z.uuid(),
    businessId: z.uuid(),
    email: z.email().max(320),
    displayName: z.string().trim().min(1).max(200),
    intendedRole: workforceRoleSchema,
    intendedLocationId: z.string().trim().min(1).max(200).nullable(),
    state: workforceInvitationStateSchema,
    version: z.number().int().positive(),
    expiresAt: utcIsoStringSchema,
    createdAt: utcIsoStringSchema,
  })
  .strict();

export const controlWorkforceMemberPageSchema = z
  .object({
    members: z.array(controlWorkforceMemberProjectionSchema).max(100),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict();

export const controlWorkforceInvitationPageSchema = z
  .object({
    invitations: z.array(controlWorkforceInvitationProjectionSchema).max(100),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict();

export const controlIssueInvitationResultSchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        status: z.literal('issued'),
        invitation: controlWorkforceInvitationProjectionSchema,
        acceptanceToken: z.string().min(32).max(512),
      })
      .strict(),
    z
      .object({
        status: z.literal('replayed'),
        invitation: controlWorkforceInvitationProjectionSchema,
      })
      .strict(),
  ],
);

export const controlInvitationMutationResultSchema =
  controlWorkforceInvitationProjectionSchema;

export const controlMembershipMutationResultSchema = z
  .object({
    member: controlWorkforceMemberDetailProjectionSchema,
    revokedSessionCount: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const controlGrantAccessResultSchema =
  controlAccessGrantProjectionSchema;

export const controlRevokeAccessResultSchema = z
  .object({
    grant: controlAccessGrantProjectionSchema,
    revokedSessionCount: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const controlInvitationMutationRequestSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

export const controlMembershipMutationRequestSchema =
  controlInvitationMutationRequestSchema;

export const controlGrantAccessRequestSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    identityId: z.uuid(),
    role: workforceRoleSchema,
    scope: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('business'), id: z.uuid() }).strict(),
      z
        .object({
          kind: z.literal('location'),
          id: z.string().trim().min(1).max(200),
        })
        .strict(),
    ]),
    startsAt: utcIsoStringSchema.optional(),
    endsAt: utcIsoStringSchema.optional(),
  })
  .strict();

export const controlGrantRevokeRequestSchema =
  controlInvitationMutationRequestSchema;

export const controlInvitationPreviewRequestSchema = z
  .object({
    acceptanceToken: z.string().trim().min(32).max(512),
  })
  .strict();

export const controlInvitationPreviewSchema = z
  .object({
    invitationId: z.uuid(),
    business: z
      .object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(200),
      })
      .strict(),
    email: z.email().max(320),
    displayName: z.string().trim().min(1).max(200),
    intendedRole: workforceRoleSchema,
    intendedLocationId: z.string().trim().min(1).max(200).nullable(),
    expiresAt: utcIsoStringSchema,
    existingIdentity: z.boolean(),
  })
  .strict();

export const controlExistingInvitationPasswordRequestSchema = z
  .object({
    acceptanceToken: z.string().trim().min(32).max(512),
    idempotencyKey: z.string().trim().min(8).max(200),
    password: z.string().min(1).max(256),
  })
  .strict();

export const controlExistingInvitationMfaRequestSchema =
  processorCompleteMfaChallengeRequestSchema.and(
    z
      .object({
        acceptanceToken: z.string().trim().min(32).max(512),
        idempotencyKey: z.string().trim().min(8).max(200),
      })
      .strict(),
  );

export const controlInvitationAcceptanceSchema = z
  .object({
    invitationId: z.uuid(),
    membershipId: z.uuid(),
    identityId: z.uuid(),
    identityCreated: z.boolean(),
    privilegedAccessEffective: z.boolean(),
    replayed: z.boolean(),
  })
  .strict();

export const controlInvitationBootstrapResultSchema = z.union([
  controlMfaChallengeSchema,
  z
    .object({
      status: z.literal('accepted'),
      acceptance: controlInvitationAcceptanceSchema,
      session: controlAuthenticatedSessionSchema.nullable(),
      destination: presslyApplicationSchema,
    })
    .strict(),
]);

export const controlMembershipParamsSchema = z
  .object({ membershipId: z.uuid() })
  .strict();

export const controlInvitationParamsSchema = z
  .object({ invitationId: z.uuid() })
  .strict();

export const controlGrantParamsSchema = z
  .object({ grantId: z.uuid() })
  .strict();

export const controlWorkforceSessionSchema = z
  .object({
    id: z.uuid(),
    issuedAt: utcIsoStringSchema,
    lastUsedAt: utcIsoStringSchema,
    expiresAt: utcIsoStringSchema,
    revokedAt: utcIsoStringSchema.nullable(),
    current: z.boolean(),
  })
  .strict();

export const controlWorkforceSessionListSchema = z
  .object({ sessions: z.array(controlWorkforceSessionSchema).max(200) })
  .strict();

export const controlWorkforceSessionRevokeRequestSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    sessionId: z.uuid().optional(),
  })
  .strict();

export const controlWorkforceSessionRevokeResultSchema = z
  .object({
    revokedCount: z.number().int().nonnegative(),
    replayed: z.boolean(),
  })
  .strict();

export const controlSecurityEventQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(1_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const controlSecurityEventSchema = z
  .object({
    id: z.uuid(),
    eventType: z.string().trim().min(1).max(160),
    resourceType: z.string().trim().min(1).max(160),
    actorDisplayName: z.string().trim().min(1).max(200).nullable(),
    createdAt: utcIsoStringSchema,
  })
  .strict();

export const controlSecurityEventListSchema = z
  .object({
    events: z.array(controlSecurityEventSchema).max(100),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict();

export type ControlCapability = z.infer<typeof controlCapabilitySchema>;
export type ControlAuthenticatedSession = z.infer<
  typeof controlAuthenticatedSessionSchema
>;
export type ControlLoginResult = z.infer<typeof controlLoginResultSchema>;
export type PresslyApplication = z.infer<typeof presslyApplicationSchema>;
export type ControlSecurityEvent = z.infer<typeof controlSecurityEventSchema>;
export type ControlSecurityEventList = z.infer<
  typeof controlSecurityEventListSchema
>;
export type ControlAccessGrantProjection = z.infer<
  typeof controlAccessGrantProjectionSchema
>;
export type ControlWorkforceMemberProjection = z.infer<
  typeof controlWorkforceMemberProjectionSchema
>;
export type ControlWorkforceMemberDetailProjection = z.infer<
  typeof controlWorkforceMemberDetailProjectionSchema
>;
export type ControlWorkforceInvitationProjection = z.infer<
  typeof controlWorkforceInvitationProjectionSchema
>;
export type ControlIssueInvitationResult = z.infer<
  typeof controlIssueInvitationResultSchema
>;
export type ControlWorkforceSession = z.infer<
  typeof controlWorkforceSessionSchema
>;
export type ControlInvitationPreview = z.infer<
  typeof controlInvitationPreviewSchema
>;
export type ControlInvitationAcceptance = z.infer<
  typeof controlInvitationAcceptanceSchema
>;
export type ControlInvitationBootstrapResult = z.infer<
  typeof controlInvitationBootstrapResultSchema
>;
