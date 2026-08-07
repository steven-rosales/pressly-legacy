import {
  identitySessionParamsSchema,
  identitySessionsParamsSchema,
  revokeIdentitySessionsResultSchema,
  type RevokeIdentitySessionsResult,
} from '@pressly/contracts/auth';
import type { RevokeIdentitySessionsOutcome } from './revoke-identity-sessions.model.ts';

export const revokeIdentitySessionsContract = Object.freeze({
  allParams: identitySessionsParamsSchema,
  oneParams: identitySessionParamsSchema,
  response: revokeIdentitySessionsResultSchema,
});

export const toRevokeIdentitySessionsResult = (
  outcome: RevokeIdentitySessionsOutcome,
): RevokeIdentitySessionsResult => ({ revokedCount: outcome.revokedCount });
