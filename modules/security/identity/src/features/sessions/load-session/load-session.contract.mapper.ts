import {
  sessionResultSchema,
  type SessionResult,
} from '@pressly/contracts/auth';
import type { Role } from '@pressly/auth/authorization';
import { authError, invariantViolationError } from '@pressly/errors/factories';
import { utcIsoFromDate } from '@pressly/time';
import type { LoadedSession } from './load-session.model.ts';
import type { LoadSessionFailure } from './load-session.failure.ts';

export const loadSessionContract = Object.freeze({
  response: sessionResultSchema,
});

const rolesFromLoadedSession = (
  assignments: readonly { role: Role }[],
): Role[] => [...new Set(assignments.map((assignment) => assignment.role))];

export const toSessionResult = (session: LoadedSession): SessionResult => {
  if (session.principal.sessionExpiresAt === undefined)
    throw invariantViolationError({
      code: 'loaded_session_missing_expiry',
      message: 'Loaded session principal is missing session expiry.',
      safeMessage: 'Session could not be loaded.',
    });

  return {
    principal: {
      identityId: session.principal.identityId,
      displayName: session.principal.displayName,
      ...(session.principal.email === undefined
        ? {}
        : { email: session.principal.email }),
      roles: rolesFromLoadedSession(session.principalAttributes.assignments),
    },
    expiresAt: utcIsoFromDate(session.principal.sessionExpiresAt),
  };
};

export const toLoadSessionHttpError = (failure: LoadSessionFailure) =>
  authError({
    code: failure.code,
    message: failure.message,
    safeMessage: failure.message,
  });
