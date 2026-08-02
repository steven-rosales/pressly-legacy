import { invariantViolationError, notFoundError } from '@pressly/errors';
import type { Response } from 'express';
import type {
  ControlAccess,
  LoadedControlSession,
} from '../session/control-session.port.ts';

export const controlAccess = (response: Response): ControlAccess =>
  response.locals['controlAccess'] as ControlAccess;

export const controlCommandContext = (response: Response) => {
  const auth = response.locals['auth'] as
    | Readonly<{ principal: LoadedControlSession['principal'] }>
    | undefined;
  if (auth?.principal === undefined)
    throw invariantViolationError({
      code: 'control_actor_missing',
      message: 'Control command has no authenticated actor.',
      safeMessage: 'Session could not be loaded.',
    });
  return {
    origin: 'pressly_control',
    principal: {
      kind: auth.principal.kind,
      id: auth.principal.identityId,
    },
  } as const;
};

export const controlLocationIds = (
  response: Response,
  requestedLocationId?: string,
): readonly string[] => {
  const allowed = controlAccess(response).locations.map(
    (location) => location.id,
  );
  if (requestedLocationId === undefined) return allowed;
  if (allowed.includes(requestedLocationId)) return [requestedLocationId];
  throw notFoundError({
    code: 'control_location_not_found',
    message: 'Requested location is outside the Control access boundary.',
    safeMessage: 'The production location was not found.',
  });
};
