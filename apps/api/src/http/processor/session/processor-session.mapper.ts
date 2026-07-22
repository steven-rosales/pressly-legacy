import type {
  AuthPrincipalResult,
  ProcessorAuthenticatedSession,
} from '@pressly/contracts';
import { makeAppError } from '@pressly/errors';
import type { Request, Response } from 'express';
import { deriveProcessorCsrfToken } from './processor-csrf.policy.ts';
import type {
  LoadedProcessorSession,
  ProcessorSessionOptions,
} from './processor-session.port.ts';

const rolesFromLoadedSession = (
  assignments: readonly {
    role: string;
    startsAt?: Date;
    endsAt?: Date;
  }[],
): AuthPrincipalResult['roles'] =>
  [
    ...new Set(
      assignments
        .filter((assignment) => {
          const now = new Date();
          return (
            (assignment.startsAt === undefined || assignment.startsAt <= now) &&
            (assignment.endsAt === undefined || assignment.endsAt > now)
          );
        })
        .map((assignment) => assignment.role),
    ),
  ] as AuthPrincipalResult['roles'];

export const processorBrowserSession = (
  loaded: LoadedProcessorSession,
  sessionToken: string,
  options: ProcessorSessionOptions,
): ProcessorAuthenticatedSession => {
  if (loaded.principal.sessionExpiresAt === undefined)
    throw makeAppError({
      kind: 'InvariantViolationError',
      code: 'loaded_session_missing_expiry',
      message: 'Loaded processor session is missing its expiry.',
      safeMessage: 'Session could not be loaded.',
      status: 500,
    });

  return {
    status: 'authenticated',
    principal: {
      identityId: loaded.principal.identityId,
      displayName: loaded.principal.displayName,
      ...(loaded.principal.email === undefined
        ? {}
        : { email: loaded.principal.email }),
      roles: rolesFromLoadedSession(loaded.principalAttributes.assignments),
    },
    expiresAt: loaded.principal.sessionExpiresAt.toISOString(),
    csrfToken: deriveProcessorCsrfToken(sessionToken, options.csrfSecret),
  };
};

export const processorRequestId = (response: Response): string | undefined =>
  response.locals['requestId'] as string | undefined;

export const processorRequestMetadata = (
  request: Request,
  response: Response,
) => ({
  ...(request.ip ? { ipAddress: request.ip } : {}),
  ...(request.header('user-agent') === undefined
    ? {}
    : { userAgent: request.header('user-agent')! }),
  ...(processorRequestId(response) === undefined
    ? {}
    : { requestId: processorRequestId(response)! }),
});
