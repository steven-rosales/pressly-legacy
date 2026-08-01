import type { ProcessorAuthenticatedSession } from '@pressly/contracts';
import { makeAppError } from '@pressly/errors';
import type { Request, Response } from 'express';
import { deriveProcessorCsrfToken } from './processor-csrf.policy.ts';
import type {
  LoadedProcessorSession,
  ProcessorAccess,
  ProcessorSessionOptions,
} from './processor-session.port.ts';

export const processorBrowserSession = (
  loaded: LoadedProcessorSession,
  access: ProcessorAccess,
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
    },
    access: {
      locations: access.locations.map((location) => ({
        ...location,
        capabilities: [...location.capabilities],
      })),
      applications: [...access.applications],
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
