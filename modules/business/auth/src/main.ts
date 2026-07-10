import {
  makePasswordVerifier,
  makeRecoveryCodeService,
  makeSecretBox,
  makeTokenIssuer,
  makeTotpAuthenticator,
} from '@pressly/auth/credentials';
import type { Database } from '@pressly/db';
import {
  Router,
  type RequestHandler,
  type Router as ExpressRouter,
} from 'express';
import { makeLoginRoute } from './login/login.route.ts';
import { makeLoginStore } from './login/login.repo.ts';
import { makeAuthenticateMiddleware } from './load-session/authenticate.middleware.ts';
import {
  makeAuthorizeMiddleware,
  type AuthorizeMiddlewareFactory,
} from './http/authorize.middleware.ts';
import { readPrincipal } from './http/auth-context.ts';
import { makeLoadSessionRouter } from './load-session/load-session.route.ts';
import { makeLoadSessionStore } from './load-session/load-session.repo.ts';
import { makeRevokeSessionRouter } from './revoke-session/revoke-session.route.ts';
import { makeRevokeSessionStore } from './revoke-session/revoke-session.repo.ts';
import { makeLogin } from './login/login.usecase.ts';
import { makeLoadSession } from './load-session/load-session.usecase.ts';
import { makeRevokeSession } from './revoke-session/revoke-session.usecase.ts';
import { makeAdministerSessionsStore } from './administer-sessions/administer-sessions.repo.ts';
import { makeListIdentitySessions } from './administer-sessions/list-identity-sessions.usecase.ts';
import { makeRevokeIdentitySessions } from './administer-sessions/revoke-identity-sessions.usecase.ts';
import {
  makeSessionAdministrationRouter,
  type SessionAdministrationSecurity,
} from './administer-sessions/administer-sessions.route.ts';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import { makeMfaRepository } from './mfa/mfa.repo.ts';
import {
  makeMfaAdministrationRouter,
  makeMfaChallengeRouter,
  type MfaRouteSecurity,
} from './mfa/mfa.route.ts';
import {
  makeBeginMfaEnrollment,
  makeConfirmMfaEnrollment,
} from './mfa/enroll-mfa.usecase.ts';
import { makeCompleteMfaChallenge } from './mfa/complete-mfa-challenge.usecase.ts';
import {
  makeRegenerateMfaRecoveryCodes,
  makeRemoveMfa,
} from './mfa/manage-mfa.usecase.ts';

export type AuthModuleDeps = Readonly<{
  db: Database;
  tokenSecret: string;
  sessionTtlMinutes: number;
  loginWindowMinutes: number;
  loginMaxFailures: number;
  mfaChallengeTtlMinutes: number;
  sessionIdleTimeoutMinutes: number;
  securityEvents?: SecurityEventSink;
  mfaEncryptionKey: string;
  mfaIssuer: string;
}>;

export type AuthGuardBundle = Readonly<{
  authenticate: RequestHandler;
  authorize: AuthorizeMiddlewareFactory;
  readPrincipal: typeof readPrincipal;
}>;

export type AuthAdministrationSecurity = Readonly<{
  sessions: SessionAdministrationSecurity;
  mfa: MfaRouteSecurity;
}>;

export type AuthModule = Readonly<{
  routes: ExpressRouter;
  guards: AuthGuardBundle;
  makeAdministrationRoutes: (
    security: AuthAdministrationSecurity,
  ) => ExpressRouter;
}>;

export const makeAuthModule = (deps: AuthModuleDeps): AuthModule => {
  const loginStore = makeLoginStore(deps.db);
  const loadSessionStore = makeLoadSessionStore(deps.db);
  const revokeSessionStore = makeRevokeSessionStore(deps.db);
  const administerSessionsStore = makeAdministerSessionsStore(deps.db);
  const mfaRepository = makeMfaRepository(deps.db);
  const tokenIssuer = makeTokenIssuer(deps.tokenSecret);
  const clock = { now: () => new Date() };
  const totp = makeTotpAuthenticator();
  const secretBox = makeSecretBox(deps.mfaEncryptionKey);
  const recoveryCodes = makeRecoveryCodeService();
  const securityEvents = deps.securityEvents ?? nullSecurityEventSink;

  const login = makeLogin({
    store: loginStore,
    passwordVerifier: makePasswordVerifier(),
    tokenIssuer,
    clock,
    options: {
      sessionTtlMinutes: deps.sessionTtlMinutes,
      loginWindowMinutes: deps.loginWindowMinutes,
      loginMaxFailures: deps.loginMaxFailures,
      mfaChallengeTtlMinutes: deps.mfaChallengeTtlMinutes,
    },
    securityEvents,
  });

  const loadSession = makeLoadSession({
    store: loadSessionStore,
    tokenHasher: tokenIssuer,
    clock,
    idleTimeoutMinutes: deps.sessionIdleTimeoutMinutes,
  });

  const revokeSession = makeRevokeSession({
    store: revokeSessionStore,
    tokenHasher: tokenIssuer,
    clock,
    securityEvents,
  });
  const listIdentitySessions = makeListIdentitySessions(
    administerSessionsStore,
  );
  const revokeIdentitySessions = makeRevokeIdentitySessions({
    store: administerSessionsStore,
    clock,
    securityEvents,
  });
  const completeMfaChallenge = makeCompleteMfaChallenge({
    store: mfaRepository,
    tokenService: tokenIssuer,
    totp,
    secretBox,
    recoveryCodes,
    clock,
    sessionTtlMinutes: deps.sessionTtlMinutes,
    securityEvents,
  });
  const beginMfaEnrollment = makeBeginMfaEnrollment({
    store: mfaRepository,
    totp,
    secretBox,
    clock,
    issuer: deps.mfaIssuer,
    securityEvents,
  });
  const confirmMfaEnrollment = makeConfirmMfaEnrollment({
    store: mfaRepository,
    totp,
    secretBox,
    recoveryCodes,
    clock,
    securityEvents,
  });
  const regenerateMfaRecoveryCodes = makeRegenerateMfaRecoveryCodes({
    store: mfaRepository,
    recoveryCodes,
    clock,
    securityEvents,
  });
  const removeMfa = makeRemoveMfa({
    store: mfaRepository,
    clock,
    securityEvents,
  });

  const routes = Router();

  routes.use('/login', makeLoginRoute(login));
  routes.use('/session', makeLoadSessionRouter({ loadSession }));
  routes.use('/logout', makeRevokeSessionRouter({ revokeSession }));
  routes.use('/mfa', makeMfaChallengeRouter(completeMfaChallenge));

  const makeAdministrationRoutes = (
    security: AuthAdministrationSecurity,
  ): ExpressRouter => {
    const administrationRoutes = Router();

    administrationRoutes.use(
      '/',
      makeSessionAdministrationRouter({
        listIdentitySessions,
        revokeIdentitySessions,
        security: security.sessions,
      }),
    );
    administrationRoutes.use(
      '/mfa',
      makeMfaAdministrationRouter({
        beginMfaEnrollment,
        confirmMfaEnrollment,
        regenerateMfaRecoveryCodes,
        removeMfa,
        security: security.mfa,
      }),
    );

    return administrationRoutes;
  };

  return {
    routes,
    guards: {
      authenticate: makeAuthenticateMiddleware(loadSession),
      authorize: makeAuthorizeMiddleware(securityEvents),
      readPrincipal,
    },
    makeAdministrationRoutes,
  };
};
