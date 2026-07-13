import type { z } from 'zod';
import type {
  completeMfaChallengeRequestSchema,
  confirmMfaEnrollmentRequestSchema,
  identitySessionParamsSchema,
  identitySessionsParamsSchema,
  loginRequestSchema,
  processorCompleteMfaChallengeRequestSchema,
} from './auth.contracts.ts';

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type IdentitySessionsParams = z.infer<
  typeof identitySessionsParamsSchema
>;
export type IdentitySessionParams = z.infer<typeof identitySessionParamsSchema>;
export type CompleteMfaChallengeRequest = z.infer<
  typeof completeMfaChallengeRequestSchema
>;
export type ConfirmMfaEnrollmentRequest = z.infer<
  typeof confirmMfaEnrollmentRequestSchema
>;
export type ProcessorCompleteMfaChallengeRequest = z.infer<
  typeof processorCompleteMfaChallengeRequestSchema
>;
