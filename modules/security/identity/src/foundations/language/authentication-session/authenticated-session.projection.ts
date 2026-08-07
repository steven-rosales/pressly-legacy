import { utcIsoFromDate } from '@pressly/time';
import type { AuthenticatedSession } from './authenticated-session.model.ts';

export const projectAuthenticatedSession = (session: AuthenticatedSession) => ({
  accessToken: session.accessToken,
  expiresAt: utcIsoFromDate(session.expiresAt),
  principal: {
    identityId: session.principal.identityId,
    displayName: session.principal.displayName,
    ...(session.principal.email === undefined
      ? {}
      : { email: session.principal.email }),
    roles: [...session.principal.roles],
  },
});
