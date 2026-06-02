import type { RequestHandler } from 'express';
import {
  actorFromPrincipal,
  selectHighestRole,
  type Actor,
  type Principal,
} from '@pressly/auth';
import { catchAsync } from '@pressly/http/express';
import { makeAppError } from '@pressly/errors';
import type { LoadSession } from '../../../features/load-session/load-session.usecase.ts';

export type AuthLocals = Readonly<{ principal: Principal; actor: Actor }>;

const missingBearerToken = () =>
  makeAppError({
    kind: 'PermissionError',
    code: 'missing_bearer_token',
    message: 'Bearer token is required.',
    safeMessage: 'Authentication is required.',
    status: 401,
  });

const readBearerToken = (authorization: string | undefined): string => {
  if (authorization === undefined) throw missingBearerToken();

  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || token === undefined || token.trim() === '')
    throw missingBearerToken();

  return token;
};

export const makeAuthenticateMiddleware = (
  loadSession: LoadSession,
): RequestHandler =>
  catchAsync(async (req, res, next) => {
    const token = readBearerToken(req.header('authorization') ?? undefined);
    const principal = await loadSession({ bearerToken: token });

    if (!principal.ok) throw principal.error;

    const role = selectHighestRole(principal.value.roles);

    if (role === undefined)
      throw makeAppError({
        kind: 'PermissionError',
        code: 'missing_role',
        message: 'Authenticated principal has no usable role.',
        safeMessage: 'You do not have permission to do this.',
        status: 403,
      });

    res.locals['auth'] = {
      principal: principal.value,
      actor: actorFromPrincipal({ principal: principal.value, role }),
    } satisfies AuthLocals;

    next();
  });
