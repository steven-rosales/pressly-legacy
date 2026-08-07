import {
  authenticatedLoginResultSchema,
  completeMfaChallengeRequestSchema,
  type AuthenticatedLoginResult,
} from '@pressly/contracts/auth';
import type { AuthenticatedSession } from '../../../foundations/language/authentication-session/authenticated-session.model.ts';
import { projectAuthenticatedSession } from '../../../foundations/language/authentication-session/authenticated-session.projection.ts';

export const completeMfaChallengeContract = Object.freeze({
  request: completeMfaChallengeRequestSchema,
  response: authenticatedLoginResultSchema,
});

export const toCompletedMfaChallengeResult = (
  session: AuthenticatedSession,
): AuthenticatedLoginResult => projectAuthenticatedSession(session);
