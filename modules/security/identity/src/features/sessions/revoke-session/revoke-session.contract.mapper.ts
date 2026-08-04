import { logoutResultSchema, type LogoutResult } from '@pressly/contracts/auth';
import type { RevokeSessionOutcome } from './revoke-session.model.ts';

export const revokeSessionContract = Object.freeze({
  response: logoutResultSchema,
});

export const toLogoutResult = (
  outcome: RevokeSessionOutcome,
): LogoutResult => ({ revoked: outcome.revoked });
