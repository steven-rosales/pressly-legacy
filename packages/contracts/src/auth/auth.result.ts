import type { z } from 'zod';
import type {
  authenticatedLoginResultSchema,
  authPrincipalSchema,
  loginResultSchema,
  logoutResultSchema,
  mfaChallengeResultSchema,
  mfaEnrollmentResultSchema,
  mfaMutationResultSchema,
  mfaRecoveryCodesResultSchema,
  processorAuthenticatedSessionSchema,
  processorLoginResultSchema,
  processorMfaChallengeSchema,
  revokeIdentitySessionsResultSchema,
  sessionInventoryItemSchema,
  sessionInventoryResultSchema,
  sessionResultSchema,
} from './auth.contracts.ts';

export type AuthPrincipalResult = z.infer<typeof authPrincipalSchema>;
export type LoginResult = z.infer<typeof loginResultSchema>;
export type AuthenticatedLoginResult = z.infer<
  typeof authenticatedLoginResultSchema
>;
export type MfaChallengeResult = z.infer<typeof mfaChallengeResultSchema>;
export type MfaEnrollmentResult = z.infer<typeof mfaEnrollmentResultSchema>;
export type MfaRecoveryCodesResult = z.infer<
  typeof mfaRecoveryCodesResultSchema
>;
export type MfaMutationResult = z.infer<typeof mfaMutationResultSchema>;
export type SessionResult = z.infer<typeof sessionResultSchema>;
export type LogoutResult = z.infer<typeof logoutResultSchema>;
export type SessionInventoryItem = z.infer<typeof sessionInventoryItemSchema>;
export type SessionInventoryResult = z.infer<
  typeof sessionInventoryResultSchema
>;
export type RevokeIdentitySessionsResult = z.infer<
  typeof revokeIdentitySessionsResultSchema
>;
export type ProcessorAuthenticatedSession = z.infer<
  typeof processorAuthenticatedSessionSchema
>;
export type ProcessorMfaChallenge = z.infer<typeof processorMfaChallengeSchema>;
export type ProcessorLoginResult = z.infer<typeof processorLoginResultSchema>;
