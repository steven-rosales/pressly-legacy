import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import type { Principal } from '@pressly/auth/authentication';
import type { PrincipalAttributes } from '@pressly/auth/authorization';
import { catchAsync } from '@pressly/http/express';
import type { LoadSession } from '../../../features/load-session/load-session.usecase.ts';
import { readBearerToken } from '../../common/read-bearer.ts';

export type AuthLocals = Readonly<{
  principal: Principal;
  principalAttributes: PrincipalAttributes;
}>;

export const makeAuthenticateMiddleware = (
  loadSession: LoadSession,
): RequestHandler =>
  catchAsync(async (req, res, next) => {
    const token = readBearerToken(req.header('authorization') ?? undefined);
    const loadedSession = await loadSession({ bearerToken: token });

    if (result.isErr(loadedSession)) throw loadedSession.error;

    res.locals['auth'] = loadedSession.value satisfies AuthLocals;

    next();
  });
