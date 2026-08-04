import type { ControlAuthenticatedSession } from '@pressly/contracts/auth';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  ControlAccess,
  LoadedControlSession,
} from './control-session.port.ts';

export const controlBrowserSession = (
  loaded: LoadedControlSession,
  access: ControlAccess,
  csrfToken: string,
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
    csrfToken,
  };
};
