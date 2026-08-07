import type {
  ControlAccess,
  ControlRequestContext,
} from '@pressly/control-experience';
import { invariantViolationError } from '@pressly/errors/factories';
import type { Response } from 'express';
import type { LoadedControlSession } from './session/control-session.port.ts';

export const readControlAccess = (response: Response): ControlAccess =>
  response.locals['controlAccess'] as ControlAccess;

export const readControlRequestContext = (
  response: Response,
): ControlRequestContext => {
  const auth = response.locals['auth'] as LoadedControlSession | undefined;
  if (auth?.principal.sessionId === undefined)
    throw invariantViolationError({
      code: 'control_actor_missing',
      message:
        'Control application request has no authenticated actor session.',
      safeMessage: 'Session could not be loaded.',
    });

  return {
    access: readControlAccess(response),
    actor: {
      identityId: auth.principal.identityId,
      sessionId: auth.principal.sessionId,
    },
    command: {
      origin: 'pressly_control',
      principal: {
        kind: auth.principal.kind,
        id: auth.principal.identityId,
      },
    },
  };
};
