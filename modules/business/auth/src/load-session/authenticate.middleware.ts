import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { catchAsync } from '@pressly/http/express';
import type { LoadSession } from './load-session.usecase.ts';
import { readBearerToken } from '../http/read-bearer.ts';
import type { AuthHttpContext } from '../http/auth-context.ts';

export const makeAuthenticateMiddleware = (
  loadSession: LoadSession,
): RequestHandler =>
  catchAsync(async (req, res, next) => {
    const token = readBearerToken(req.header('authorization') ?? undefined);
    const loadedSession = await loadSession({ bearerToken: token });

    if (result.isErr(loadedSession)) throw loadedSession.error;

    res.locals['auth'] = loadedSession.value satisfies AuthHttpContext;

    next();
  });
