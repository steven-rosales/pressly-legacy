import type { ControlAuthenticatedSession } from '@pressly/contracts';
import { invariantViolationError } from '@pressly/errors';
import type { Request, Response } from 'express';
import { deriveControlCsrfToken } from './control-csrf.policy.ts';
import type {
  ControlAccess,
  ControlSessionOptions,
  LoadedControlSession,
} from './control-session.port.ts';

export const controlBrowserSession = (
  loaded: LoadedControlSession,
  access: ControlAccess,
  sessionToken: string,
  options: ControlSessionOptions,
): ControlAuthenticatedSession => {
  if (loaded.principal.sessionExpiresAt === undefined)
    throw invariantViolationError({
      code: 'loaded_control_session_missing_expiry',
      message: 'Loaded Control session is missing its expiry.',
      safeMessage: 'Session could not be loaded.',
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
      business: access.business,
      locations: [...access.locations],
      selectedLocationId: access.selectedLocationId,
      capabilities: [...access.capabilities],
      applications: [...access.applications],
    },
    expiresAt: loaded.principal.sessionExpiresAt.toISOString(),
    csrfToken: deriveControlCsrfToken(sessionToken, options.csrfSecret),
  };
};

export const controlRequestId = (response: Response): string | undefined =>
  response.locals['requestId'] as string | undefined;

export const controlRequestMetadata = (
  request: Request,
  response: Response,
) => ({
  ...(request.ip ? { ipAddress: request.ip } : {}),
  ...(request.header('user-agent') === undefined
    ? {}
    : { userAgent: request.header('user-agent')! }),
  ...(controlRequestId(response) === undefined
    ? {}
    : { requestId: controlRequestId(response)! }),
});
