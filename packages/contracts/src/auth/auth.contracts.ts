import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';

export const authRoleSchema = z.enum([
  'owner',
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

export const processorAuthenticatedSessionSchema = z
  .object({
    status: z.literal('authenticated'),
    principal: authPrincipalSchema,
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
    secret: z.string().min(16),
    enrollmentUri: z.string().startsWith('otpauth://totp/'),
  })
  .strict();

export const mfaRecoveryCodesResultSchema = z
  .object({ recoveryCodes: z.array(z.string()).min(1) })
  .strict();

export const mfaMutationResultSchema = z
  .object({ updated: z.literal(true) })
  .strict();
