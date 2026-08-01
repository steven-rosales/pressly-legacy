import {
  makePasswordVerifier,
  makePasswordHasher,
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
import { readPrincipal, readPrincipalAttributes } from './http/auth-context.ts';
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
import type { Login } from './login/login.usecase.ts';
import type { LoadSession } from './load-session/load-session.usecase.ts';
import type { RevokeSession } from './revoke-session/revoke-session.usecase.ts';
import type { CompleteMfaChallenge } from './mfa/complete-mfa-challenge.usecase.ts';
import { makeWorkforceInvitationStore } from './workforce/workforce-invitation.repo.ts';
import { makeIssueWorkforceInvitation } from './workforce/issue-workforce-invitation.usecase.ts';
import { makeReissueWorkforceInvitation } from './workforce/reissue-workforce-invitation.usecase.ts';
import { makeRevokeWorkforceInvitation } from './workforce/revoke-workforce-invitation.usecase.ts';
import { makePreviewWorkforceInvitation } from './workforce/preview-workforce-invitation.usecase.ts';
import { makeAcceptWorkforceInvitation } from './workforce/accept-workforce-invitation.usecase.ts';
import { makeListWorkforceInvitations } from './workforce/list-workforce-invitations.usecase.ts';
import { makeWorkforceMembershipStore } from './workforce/workforce-membership.repo.ts';
import { makeListWorkforce } from './workforce/list-workforce.usecase.ts';
import { makeGetWorkforceMember } from './workforce/get-workforce-member.usecase.ts';
import {
  makeEndWorkforceMembership,
  makeReactivateWorkforceMembership,
  makeSuspendWorkforceMembership,
} from './workforce/transition-workforce-membership.usecase.ts';
import { makeAccessGrantStore } from './workforce/access-grant.repo.ts';
import { makeGrantWorkforceAccess } from './workforce/grant-workforce-access.usecase.ts';
import { makeRevokeWorkforceAccess } from './workforce/revoke-workforce-access.usecase.ts';
import { makeWorkforceSecurityStore } from './workforce/workforce-security.repo.ts';
import {
  makeListWorkforceMemberSessions,
  makeListWorkforceSecurityEvents,
  makeRevokeWorkforceMemberSessions,
  type ListWorkforceMemberSessions,
  type ListWorkforceSecurityEvents,
  type RevokeWorkforceMemberSessions,
} from './workforce/workforce-security.usecase.ts';
import type { IssueWorkforceInvitation } from './workforce/issue-workforce-invitation.usecase.ts';
import type { ReissueWorkforceInvitation } from './workforce/reissue-workforce-invitation.usecase.ts';
import type { RevokeWorkforceInvitation } from './workforce/revoke-workforce-invitation.usecase.ts';
import type { PreviewWorkforceInvitation } from './workforce/preview-workforce-invitation.usecase.ts';
import type { AcceptWorkforceInvitation } from './workforce/accept-workforce-invitation.usecase.ts';
import type { ListWorkforceInvitations } from './workforce/list-workforce-invitations.usecase.ts';
import type { ListWorkforce } from './workforce/list-workforce.usecase.ts';
import type { GetWorkforceMember } from './workforce/get-workforce-member.usecase.ts';
import type { TransitionWorkforceMembership } from './workforce/transition-workforce-membership.usecase.ts';
import type { GrantWorkforceAccess } from './workforce/grant-workforce-access.usecase.ts';
import type { RevokeWorkforceAccess } from './workforce/revoke-workforce-access.usecase.ts';

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
  workforceInvitationTtlMinutes?: number;
}>;

export type AuthGuardBundle = Readonly<{
  authenticate: RequestHandler;
  authorize: AuthorizeMiddlewareFactory;
  readPrincipal: typeof readPrincipal;
  readPrincipalAttributes: typeof readPrincipalAttributes;
}>;

export type AuthAdministrationSecurity = Readonly<{
  sessions: SessionAdministrationSecurity;
  mfa: MfaRouteSecurity;
}>;

export type AuthModule = Readonly<{
  routes: ExpressRouter;
  guards: AuthGuardBundle;
  application: Readonly<{
    login: Login;
    loadSession: LoadSession;
    revokeSession: RevokeSession;
    completeMfaChallenge: CompleteMfaChallenge;
    workforce: WorkforceApplication;
  }>;
  makeAdministrationRoutes: (
    security: AuthAdministrationSecurity,
  ) => ExpressRouter;
}>;

export type WorkforceApplication = Readonly<{
  issueInvitation: IssueWorkforceInvitation;
  reissueInvitation: ReissueWorkforceInvitation;
  revokeInvitation: RevokeWorkforceInvitation;
  previewInvitation: PreviewWorkforceInvitation;
  acceptInvitation: AcceptWorkforceInvitation;
  listInvitations: ListWorkforceInvitations;
  listWorkforce: ListWorkforce;
  getWorkforceMember: GetWorkforceMember;
  suspendMembership: TransitionWorkforceMembership;
  reactivateMembership: TransitionWorkforceMembership;
  endMembership: TransitionWorkforceMembership;
  grantAccess: GrantWorkforceAccess;
  revokeAccess: RevokeWorkforceAccess;
  listMemberSessions: ListWorkforceMemberSessions;
  revokeMemberSessions: RevokeWorkforceMemberSessions;
  listSecurityEvents: ListWorkforceSecurityEvents;
}>;

export const makeAuthModule = (deps: AuthModuleDeps): AuthModule => {
  const loginStore = makeLoginStore(deps.db);
  const loadSessionStore = makeLoadSessionStore(deps.db);
  const revokeSessionStore = makeRevokeSessionStore(deps.db);
  const administerSessionsStore = makeAdministerSessionsStore(deps.db);
  const mfaRepository = makeMfaRepository(deps.db);
  const workforceInvitationStore = makeWorkforceInvitationStore(deps.db);
  const workforceMembershipStore = makeWorkforceMembershipStore(deps.db);
  const accessGrantStore = makeAccessGrantStore(deps.db);
  const workforceSecurityStore = makeWorkforceSecurityStore(deps.db);
  const tokenIssuer = makeTokenIssuer(deps.tokenSecret);
  const passwordHasher = makePasswordHasher();
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
  const invitationDeps = {
    store: workforceInvitationStore,
    tokenService: tokenIssuer,
    clock,
    invitationTtlMinutes: deps.workforceInvitationTtlMinutes ?? 72 * 60,
  };
  const workforce: WorkforceApplication = {
    issueInvitation: makeIssueWorkforceInvitation(invitationDeps),
    reissueInvitation: makeReissueWorkforceInvitation(invitationDeps),
    revokeInvitation: makeRevokeWorkforceInvitation({
      store: workforceInvitationStore,
      clock,
    }),
    previewInvitation: makePreviewWorkforceInvitation({
      store: workforceInvitationStore,
      tokenService: tokenIssuer,
      clock,
    }),
    acceptInvitation: makeAcceptWorkforceInvitation({
      store: workforceInvitationStore,
      tokenService: tokenIssuer,
      passwordHasher,
      clock,
    }),
    listInvitations: makeListWorkforceInvitations({
      store: workforceInvitationStore,
      clock,
    }),
    listWorkforce: makeListWorkforce({
      store: workforceMembershipStore,
      clock,
    }),
    getWorkforceMember: makeGetWorkforceMember({
      store: workforceMembershipStore,
      clock,
    }),
    suspendMembership: makeSuspendWorkforceMembership({
      store: workforceMembershipStore,
      clock,
    }),
    reactivateMembership: makeReactivateWorkforceMembership({
      store: workforceMembershipStore,
      clock,
    }),
    endMembership: makeEndWorkforceMembership({
      store: workforceMembershipStore,
      clock,
    }),
    grantAccess: makeGrantWorkforceAccess({
      store: accessGrantStore,
      clock,
    }),
    revokeAccess: makeRevokeWorkforceAccess({
      store: accessGrantStore,
      clock,
    }),
    listMemberSessions: makeListWorkforceMemberSessions({
      store: workforceSecurityStore,
      clock,
    }),
    revokeMemberSessions: makeRevokeWorkforceMemberSessions({
      store: workforceSecurityStore,
      clock,
    }),
    listSecurityEvents: makeListWorkforceSecurityEvents({
      store: workforceSecurityStore,
      clock,
    }),
  };

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
      readPrincipalAttributes,
    },
    application: {
      login,
      loadSession,
      revokeSession,
      completeMfaChallenge,
      workforce,
    },
    makeAdministrationRoutes,
  };
};
