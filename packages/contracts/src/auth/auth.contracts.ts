import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';

export const authRoleSchema = z.enum([
  'owner',
  'manager',
  'admin',
  'operator',
  'customer',
  'driver',
  'service',
  'developer',
  'ci',
]);

export const loginRequestSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
  })
  .strict();

export const authPrincipalSchema = z
  .object({
    identityId: z.uuid(),
    displayName: z.string().min(1),
    email: z.email().optional(),
    roles: z.array(authRoleSchema).min(1),
  })
  .strict();

export const authenticatedLoginResultSchema = z
  .object({
    accessToken: z.string().min(32),
    expiresAt: utcIsoStringSchema,
    principal: authPrincipalSchema,
  })
  .strict();

export const mfaChallengeResultSchema = z
  .object({
    status: z.literal('mfa_required'),
    challengeToken: z.string().min(32),
    expiresAt: utcIsoStringSchema,
  })
  .strict();

export const loginResultSchema = z.union([
  authenticatedLoginResultSchema,
  mfaChallengeResultSchema,
]);

export const sessionResultSchema = z
  .object({
    principal: authPrincipalSchema,
    expiresAt: utcIsoStringSchema,
  })
  .strict();

export const logoutResultSchema = z
  .object({ revoked: z.literal(true) })
  .strict();

export const processorCapabilitySchema = z.enum([
  'processor:view',
  'production:read',
  'production:schedule',
  'production:accept',
  'production:start',
  'production:queue',
  'production:override',
  'production:priority',
  'production:intake',
  'production:admission',
  'production:resources',
  'production:stage',
]);

const processorPrincipalSchema = z
  .object({
    identityId: z.uuid(),
    displayName: z.string().trim().min(1).max(200),
    email: z.email().optional(),
  })
  .strict();

const processorApplicationSchema = z
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

const processorCapabilityListSchema = z
  .array(processorCapabilitySchema)
  .max(processorCapabilitySchema.options.length)
  .refine(
    (capabilities) => new Set(capabilities).size === capabilities.length,
    'Processor capabilities must be unique.',
  );

export const processorAuthenticatedSessionSchema = z
  .object({
    status: z.literal('authenticated'),
    principal: processorPrincipalSchema,
    access: z
      .object({
        locations: z
          .array(
            z
              .object({
                id: z.string().trim().min(1).max(200),
                name: z.string().trim().min(1).max(200),
                timezone: z.string().trim().min(1).max(100),
                capabilities: processorCapabilityListSchema,
              })
              .strict(),
          )
          .max(100),
        applications: z.array(processorApplicationSchema).max(2),
      })
      .strict(),
    expiresAt: utcIsoStringSchema,
    csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

export const processorMfaChallengeSchema = z
  .object({
    status: z.literal('mfa_required'),
    expiresAt: utcIsoStringSchema,
  })
  .strict();

export const processorLoginResultSchema = z.discriminatedUnion('status', [
  processorAuthenticatedSessionSchema,
  processorMfaChallengeSchema,
]);

export const processorCompleteMfaChallengeRequestSchema = z.discriminatedUnion(
  'method',
  [
    z
      .object({
        method: z.literal('totp'),
        code: z.string().regex(/^\d{6}$/),
      })
      .strict(),
    z
      .object({
        method: z.literal('recovery'),
        code: z.string().min(16).max(40),
      })
      .strict(),
  ],
);

export const identitySessionsParamsSchema = z
  .object({ identityId: z.uuid() })
  .strict();

export const identitySessionParamsSchema = identitySessionsParamsSchema
  .extend({ sessionId: z.uuid() })
  .strict();

export const sessionInventoryItemSchema = z
  .object({
    id: z.uuid(),
    issuedAt: utcIsoStringSchema,
    lastUsedAt: utcIsoStringSchema,
    expiresAt: utcIsoStringSchema,
    revokedAt: utcIsoStringSchema.nullable(),
  })
  .strict();

export const sessionInventoryResultSchema = z
  .object({ sessions: z.array(sessionInventoryItemSchema) })
  .strict();

export const revokeIdentitySessionsResultSchema = z
  .object({ revokedCount: z.number().int().nonnegative() })
  .strict();

export const completeMfaChallengeRequestSchema = z.discriminatedUnion(
  'method',
  [
    z
      .object({
        challengeToken: z.string().min(32),
        method: z.literal('totp'),
        code: z.string().regex(/^\d{6}$/),
      })
      .strict(),
    z
      .object({
        challengeToken: z.string().min(32),
        method: z.literal('recovery'),
        code: z.string().min(16).max(40),
      })
      .strict(),
  ],
);

export const confirmMfaEnrollmentRequestSchema = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();

export const mfaEnrollmentResultSchema = z
  .object({
    secret: z.string().min(16).max(512),
    enrollmentUri: z.string().max(2_000).startsWith('otpauth://totp/'),
  })
  .strict();

export const mfaRecoveryCodesResultSchema = z
  .object({
    recoveryCodes: z.array(z.string().min(8).max(100)).min(1).max(20),
  })
  .strict();

export const mfaMutationResultSchema = z
  .object({ updated: z.literal(true) })
  .strict();

export type ProcessorCapability = z.infer<typeof processorCapabilitySchema>;
