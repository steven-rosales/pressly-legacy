import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import type { LoadSession } from './load-session.usecase.ts';
import { readBearerToken } from '../../../foundations/adapters/http/authentication-request/read-bearer.adapter.ts';
import type { AuthHttpContext } from '../../../foundations/adapters/http/authentication-request/auth-context.adapter.ts';
import { toLoadSessionHttpError } from './load-session.contract.mapper.ts';

export const makeAuthenticateMiddleware =
  (loadSession: LoadSession): RequestHandler =>
  async (req, res, next) => {
    const token = readBearerToken(req.header('authorization') ?? undefined);
    const loadedSession = await loadSession({ bearerToken: token });

    if (result.isErr(loadedSession))
      throw toLoadSessionHttpError(loadedSession.error);

    res.locals['auth'] = loadedSession.value satisfies AuthHttpContext;

    next();
  };
