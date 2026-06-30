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
import { makeAdministerSessionsStore } from './adapters/administer-sessions/persistence/administer-sessions.repo.ts';
import {
  makeListIdentitySessions,
  type ListIdentitySessions,
} from './features/administer-sessions/list-identity-sessions.usecase.ts';
import {
  makeRevokeIdentitySessions,
  type RevokeIdentitySessions,
} from './features/administer-sessions/revoke-identity-sessions.usecase.ts';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import { makeMfaStore } from './adapters/mfa/persistence/mfa.repo.ts';
import { makeMfaChallengeRouter } from './adapters/mfa/http/mfa.route.ts';
import {
  makeBeginMfaEnrollment,
  makeConfirmMfaEnrollment,
  type BeginMfaEnrollment,
  type ConfirmMfaEnrollment,
} from './features/mfa/enroll-mfa.usecase.ts';
import {
  makeCompleteMfaChallenge,
  type CompleteMfaChallenge,
} from './features/mfa/complete-mfa-challenge.usecase.ts';
import {
  makeRegenerateMfaRecoveryCodes,
  makeRemoveMfa,
  type RegenerateMfaRecoveryCodes,
  type RemoveMfa,
} from './features/mfa/manage-mfa.usecase.ts';

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
    listIdentitySessions: ListIdentitySessions;
    revokeIdentitySessions: RevokeIdentitySessions;
    completeMfaChallenge: CompleteMfaChallenge;
    beginMfaEnrollment: BeginMfaEnrollment;
    confirmMfaEnrollment: ConfirmMfaEnrollment;
    regenerateMfaRecoveryCodes: RegenerateMfaRecoveryCodes;
    removeMfa: RemoveMfa;
  }>;
}>;

export const makeAuthModule = (deps: AuthModuleDeps): AuthModule => {
  const loginStore = makeLoginStore(deps.db);
  const loadSessionStore = makeLoadSessionStore(deps.db);
  const revokeSessionStore = makeRevokeSessionStore(deps.db);
  const administerSessionsStore = makeAdministerSessionsStore(deps.db);
  const mfaStore = makeMfaStore(deps.db);
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
    store: mfaStore,
    tokenService: tokenIssuer,
    totp,
    secretBox,
    recoveryCodes,
    clock,
    sessionTtlMinutes: deps.sessionTtlMinutes,
    securityEvents,
  });
  const beginMfaEnrollment = makeBeginMfaEnrollment({
    store: mfaStore,
    totp,
    secretBox,
    clock,
    issuer: deps.mfaIssuer,
    securityEvents,
  });
  const confirmMfaEnrollment = makeConfirmMfaEnrollment({
    store: mfaStore,
    totp,
    secretBox,
    recoveryCodes,
    clock,
    securityEvents,
  });
  const regenerateMfaRecoveryCodes = makeRegenerateMfaRecoveryCodes({
    store: mfaStore,
    recoveryCodes,
    clock,
    securityEvents,
  });
  const removeMfa = makeRemoveMfa({
    store: mfaStore,
    clock,
    securityEvents,
  });

  const routes = Router();

  routes.use('/login', makeLoginRoute(login));
  routes.use('/session', makeLoadSessionRouter({ loadSession }));
  routes.use('/logout', makeRevokeSessionRouter({ revokeSession }));
  routes.use('/mfa', makeMfaChallengeRouter(completeMfaChallenge));

  return {
    routes,
    guards: {
      authenticate: makeAuthenticateMiddleware(loadSession),
      authorize: makeAuthorizeMiddleware(securityEvents),
    },
    usecases: {
      login,
      loadSession,
      revokeSession,
      listIdentitySessions,
      revokeIdentitySessions,
      completeMfaChallenge,
      beginMfaEnrollment,
      confirmMfaEnrollment,
      regenerateMfaRecoveryCodes,
      removeMfa,
    },
  };
};
