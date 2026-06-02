import { makePasswordVerifier, makeTokenIssuer } from '@pressly/auth';
import type { Database } from '@pressly/db';
import {
  Router,
  type RequestHandler,
  type Router as ExpressRouter,
} from 'express';
import { makeLoginRoute } from './adapters/login/http/login.route.ts';
import { makeLoginStore } from './adapters/login/persistence/login.repo.ts';
import { makeAuthenticateMiddleware } from './adapters/load-session/http/authenticate.middleware.ts';
import {
  makeAuthorizeMiddleware,
  type AuthorizeMiddlewareFactory,
} from './adapters/load-session/http/authorize.middleware.ts';
import { makeLoadSessionRouter } from './adapters/load-session/http/load-session.route.ts';
import { makeLoadSessionStore } from './adapters/load-session/persistence/load-session.repo.ts';
import { makeRevokeSessionRouter } from './adapters/revoke-session/http/revoke-session.route.ts';
import { makeRevokeSessionStore } from './adapters/revoke-session/persistence/revoke-session.repo.ts';
import { makeLogin, type Login } from './features/login/login.usecase.ts';
import {
  makeLoadSession,
  type LoadSession,
} from './features/load-session/load-session.usecase.ts';
import {
  makeRevokeSession,
  type RevokeSession,
} from './features/revoke-session/revoke-session.usecase.ts';

export type AuthModuleDeps = Readonly<{
  db: Database;
  tokenSecret: string;
  sessionTtlMinutes: number;
  loginWindowMinutes: number;
  loginMaxFailures: number;
}>;

export type AuthModule = Readonly<{
  routes: ExpressRouter;
  guards: Readonly<{
    authenticate: RequestHandler;
    authorize: AuthorizeMiddlewareFactory;
  }>;
  usecases: Readonly<{
    login: Login;
    loadSession: LoadSession;
    revokeSession: RevokeSession;
  }>;
}>;

export const makeAuthModule = (deps: AuthModuleDeps): AuthModule => {
  const loginStore = makeLoginStore(deps.db);
  const loadSessionStore = makeLoadSessionStore(deps.db);
  const revokeSessionStore = makeRevokeSessionStore(deps.db);
  const tokenIssuer = makeTokenIssuer(deps.tokenSecret);
  const clock = { now: () => new Date() };

  const login = makeLogin({
    store: loginStore,
    passwordVerifier: makePasswordVerifier(),
    tokenIssuer,
    clock,
    options: {
      sessionTtlMinutes: deps.sessionTtlMinutes,
      loginWindowMinutes: deps.loginWindowMinutes,
      loginMaxFailures: deps.loginMaxFailures,
    },
  });

  const loadSession = makeLoadSession({
    store: loadSessionStore,
    tokenHasher: tokenIssuer,
    clock,
  });

  const revokeSession = makeRevokeSession({
    store: revokeSessionStore,
    tokenHasher: tokenIssuer,
    clock,
  });

  const routes = Router();

  routes.use('/login', makeLoginRoute(login));
  routes.use('/session', makeLoadSessionRouter({ loadSession }));
  routes.use('/logout', makeRevokeSessionRouter({ revokeSession }));

  return {
    routes,
    guards: {
      authenticate: makeAuthenticateMiddleware(loadSession),
      authorize: makeAuthorizeMiddleware(),
    },
    usecases: {
      login,
      loadSession,
      revokeSession,
    },
  };
};
