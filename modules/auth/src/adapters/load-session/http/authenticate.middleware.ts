import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import {
  actorFromPrincipal,
  selectHighestRole,
  type Actor,
  type Principal,
} from '@pressly/auth';
import { catchAsync } from '@pressly/http/express';
import { makeAppError } from '@pressly/errors';
import type { LoadSession } from '../../../features/load-session/load-session.usecase.ts';
import { readBearerToken } from '../../common/read-bearer.ts';

export type AuthLocals = Readonly<{ principal: Principal; actor: Actor }>;

export const makeAuthenticateMiddleware = (
  loadSession: LoadSession,
): RequestHandler =>
  catchAsync(async (req, res, next) => {
    const token = readBearerToken(req.header('authorization') ?? undefined);
    const principal = await loadSession({ bearerToken: token });

    if (result.isErr(principal)) throw principal.error;

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
