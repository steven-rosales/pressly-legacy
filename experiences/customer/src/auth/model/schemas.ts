import { z } from 'zod';

const canonicalUtcIsoSchema = z.string().refine((value) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}, 'Expected a canonical UTC ISO datetime.');

export const utcDateSchema = z.codec(canonicalUtcIsoSchema, z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
});

export const requestMetadataSchema = z
  .object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    requestId: z.string().optional(),
  })
  .strict();

export const loginBodySchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
  })
  .strict();

export const loginInputSchema = requestMetadataSchema.extend({
  email: z.email(),
  password: z.string().min(8),
});

export const customerPrincipalSchema = z
  .object({
    identityId: z.uuid(),
    customerId: z.uuid(),
    audience: z.literal('customer'),
    displayName: z.string().min(1),
    email: z.email().optional(),
  })
  .strict();

export const authenticatedSessionSchema = z
  .object({
    accessToken: z.string().min(32),
    expiresAt: utcDateSchema,
    principal: customerPrincipalSchema,
  })
  .strict();

export const loginOutputSchema = z.union([
  authenticatedSessionSchema,
  z
    .object({
      status: z.literal('mfa_required'),
      challengeToken: z.string().min(32),
      expiresAt: utcDateSchema,
      principal: customerPrincipalSchema,
    })
    .strict(),
]);

export const loginFailureSchema = z
  .object({
    kind: z.enum(['authentication', 'rate_limit']),
    code: z.enum(['invalid_credentials', 'login_rate_limited']),
    message: z.string(),
  })
  .strict();

export const bearerInputSchema = z
  .object({ bearerToken: z.string().min(1), requestId: z.string().optional() })
  .strict();

export const sessionOutputSchema = z
  .object({
    principal: customerPrincipalSchema,
    expiresAt: utcDateSchema,
  })
  .strict();

export const loadSessionFailureSchema = z
  .object({
    kind: z.literal('authentication'),
    code: z.enum(['invalid_session', 'session_expired']),
    message: z.string(),
  })
  .strict();

export const logoutOutputSchema = z
  .object({ revoked: z.literal(true) })
  .strict();

export const completeMfaBodySchema = z.discriminatedUnion('method', [
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
]);

export const completeMfaInputSchema = z.union([
  ...completeMfaBodySchema.options.map((schema) =>
    schema.extend({ requestId: z.string().optional() }),
  ),
]);

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

export const principalContextSchema = z
  .object({
    identityId: z.uuid(),
    sessionId: z.uuid(),
    label: z.string().min(1),
  })
  .strict();

export const identityInputSchema = z.object({ identityId: z.uuid() }).strict();

export const revokeIdentityInputSchema = z
  .object({
    principalIdentityId: z.uuid(),
    identityId: z.uuid(),
    sessionId: z.uuid().optional(),
    requestId: z.string().optional(),
  })
  .strict();

export const sessionInventorySchema = z
  .object({
    sessions: z.array(
      z
        .object({
          id: z.uuid(),
          issuedAt: utcDateSchema,
          lastUsedAt: utcDateSchema,
          expiresAt: utcDateSchema,
          revokedAt: utcDateSchema.nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const revokedCountSchema = z
  .object({ revokedCount: z.number().int().nonnegative() })
  .strict();

export const beginMfaInputSchema = z
  .object({
    identityId: z.uuid(),
    label: z.string().min(1),
    requestId: z.string().optional(),
  })
  .strict();

export const enrollmentSchema = z
  .object({
    secret: z.string().min(16).max(512),
    enrollmentUri: z.string().max(2_000).startsWith('otpauth://totp/'),
  })
  .strict();

export const confirmMfaInputSchema = z
  .object({
    identityId: z.uuid(),
    sessionId: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
    requestId: z.string().optional(),
  })
  .strict();

export const confirmMfaBodySchema = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();

export const identityMutationInputSchema = z
  .object({
    identityId: z.uuid(),
    requestId: z.string().optional(),
  })
  .strict();

export const removeMfaInputSchema = identityMutationInputSchema.extend({
  sessionId: z.uuid(),
});

export const recoveryCodesSchema = z
  .object({
    recoveryCodes: z.array(z.string().min(8).max(100)).min(1).max(20),
  })
  .strict();

export const mfaMutationSchema = z
  .object({ updated: z.literal(true) })
  .strict();

export const noFailureSchema = z.never();

export type LoginInput = z.output<typeof loginInputSchema>;
export type LoginOutput = z.output<typeof loginOutputSchema>;
export type AuthenticatedSessionOutput = z.output<
  typeof authenticatedSessionSchema
>;
export type CustomerPrincipal = z.output<typeof customerPrincipalSchema>;
export type LoginFailure = z.output<typeof loginFailureSchema>;
export type BearerInput = z.output<typeof bearerInputSchema>;
export type SessionOutput = z.output<typeof sessionOutputSchema>;
export type LoadSessionFailure = z.output<typeof loadSessionFailureSchema>;
export type LogoutOutput = z.output<typeof logoutOutputSchema>;
export type CompleteMfaInput = z.output<typeof completeMfaInputSchema>;
export type MfaFailure = z.output<typeof mfaFailureSchema>;
export type IdentityInput = z.output<typeof identityInputSchema>;
export type RevokeIdentityInput = z.output<typeof revokeIdentityInputSchema>;
export type SessionInventory = z.output<typeof sessionInventorySchema>;
export type RevokedCount = z.output<typeof revokedCountSchema>;
export type BeginMfaInput = z.output<typeof beginMfaInputSchema>;
export type Enrollment = z.output<typeof enrollmentSchema>;
export type ConfirmMfaInput = z.output<typeof confirmMfaInputSchema>;
export type IdentityMutationInput = z.output<
  typeof identityMutationInputSchema
>;
export type RemoveMfaInput = z.output<typeof removeMfaInputSchema>;
export type PrincipalContext = z.output<typeof principalContextSchema>;
export type RecoveryCodes = z.output<typeof recoveryCodesSchema>;
export type MfaMutation = z.output<typeof mfaMutationSchema>;
