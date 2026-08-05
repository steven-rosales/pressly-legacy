import {
  makePasswordVerifier,
  makePasswordHasher,
  makeRecoveryCodeService,
  makeSecretBox,
  makeTokenIssuer,
  makeTotpAuthenticator,
} from '@pressly/auth/credentials';
import type { Database } from '@pressly/db/client';
import type { Clock } from '@pressly/time';
import {
  Router,
  type RequestHandler,
  type Router as ExpressRouter,
} from 'express';
import { makeLoginRoute } from '../features/sessions/login/login.route.ts';
import { makeLoginStore } from '../features/sessions/login/login.repo.ts';
import { makeAuthenticateMiddleware } from '../features/sessions/load-session/authenticate.middleware.ts';
import {
  makeAuthorizeMiddleware,
  type AuthorizeMiddlewareFactory,
} from '../foundations/adapters/http/authentication-request/authorize-request.adapter.ts';
import {
  readPrincipal,
  readPrincipalAttributes,
} from '../foundations/adapters/http/authentication-request/auth-context.adapter.ts';
import { makeLoadSessionRouter } from '../features/sessions/load-session/load-session.route.ts';
import { makeLoadSessionStore } from '../features/sessions/load-session/load-session.repo.ts';
import { makeRevokeSessionRouter } from '../features/sessions/revoke-session/revoke-session.route.ts';
import { makeRevokeSessionStore } from '../features/sessions/revoke-session/revoke-session.repo.ts';
import { makeLogin } from '../features/sessions/login/login.usecase.ts';
import { makeLoadSession } from '../features/sessions/load-session/load-session.usecase.ts';
import { makeRevokeSession } from '../features/sessions/revoke-session/revoke-session.usecase.ts';
import { makeListIdentitySessionsStore } from '../features/sessions/list-identity-sessions/list-identity-sessions.repo.ts';
import { makeListIdentitySessions } from '../features/sessions/list-identity-sessions/list-identity-sessions.usecase.ts';
import { makeListIdentitySessionsRouter } from '../features/sessions/list-identity-sessions/list-identity-sessions.route.ts';
import { makeRevokeIdentitySessions } from '../features/sessions/revoke-identity-sessions/revoke-identity-sessions.usecase.ts';
import { makeRevokeIdentitySessionsStore } from '../features/sessions/revoke-identity-sessions/revoke-identity-sessions.repo.ts';
import { makeRevokeIdentitySessionsRouter } from '../features/sessions/revoke-identity-sessions/revoke-identity-sessions.route.ts';
import type { ReadPrincipalIdentityId } from '../features/sessions/revoke-identity-sessions/revoke-identity-sessions.controller.ts';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import { makeBeginMfaEnrollmentStore } from '../features/mfa/begin-mfa-enrollment/begin-mfa-enrollment.repo.ts';
import { makeBeginMfaEnrollment } from '../features/mfa/begin-mfa-enrollment/begin-mfa-enrollment.usecase.ts';
import { makeBeginMfaEnrollmentRouter } from '../features/mfa/begin-mfa-enrollment/begin-mfa-enrollment.route.ts';
import { makeConfirmMfaEnrollment } from '../features/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.usecase.ts';
import { makeConfirmMfaEnrollmentStore } from '../features/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.repo.ts';
import { makeConfirmMfaEnrollmentRouter } from '../features/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.route.ts';
import { makeCompleteMfaChallenge } from '../features/mfa/complete-mfa-challenge/complete-mfa-challenge.usecase.ts';
import { makeCompleteMfaChallengeStore } from '../features/mfa/complete-mfa-challenge/complete-mfa-challenge.repo.ts';
import { makeCompleteMfaChallengeRouter } from '../features/mfa/complete-mfa-challenge/complete-mfa-challenge.route.ts';
import { makeRegenerateMfaRecoveryCodes } from '../features/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.usecase.ts';
import { makeRegenerateMfaRecoveryCodesStore } from '../features/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.repo.ts';
import { makeRegenerateMfaRecoveryCodesRouter } from '../features/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.route.ts';
import { makeRemoveMfa } from '../features/mfa/remove-mfa/remove-mfa.usecase.ts';
import { makeRemoveMfaStore } from '../features/mfa/remove-mfa/remove-mfa.repo.ts';
import { makeRemoveMfaRouter } from '../features/mfa/remove-mfa/remove-mfa.route.ts';
import type { Login } from '../features/sessions/login/login.usecase.ts';
import type { LoadSession } from '../features/sessions/load-session/load-session.usecase.ts';
import type { RevokeSession } from '../features/sessions/revoke-session/revoke-session.usecase.ts';
import type { CompleteMfaChallenge } from '../features/mfa/complete-mfa-challenge/complete-mfa-challenge.usecase.ts';
import { makeIssueWorkforceInvitationStore } from '../features/workforce/invitations/issue-workforce-invitation/issue-workforce-invitation.repo.ts';
import { makeIssueWorkforceInvitation } from '../features/workforce/invitations/issue-workforce-invitation/issue-workforce-invitation.usecase.ts';
import { makeReissueWorkforceInvitation } from '../features/workforce/invitations/reissue-workforce-invitation/reissue-workforce-invitation.usecase.ts';
import { makeReissueWorkforceInvitationStore } from '../features/workforce/invitations/reissue-workforce-invitation/reissue-workforce-invitation.repo.ts';
import { makeRevokeWorkforceInvitation } from '../features/workforce/invitations/revoke-workforce-invitation/revoke-workforce-invitation.usecase.ts';
import { makeRevokeWorkforceInvitationStore } from '../features/workforce/invitations/revoke-workforce-invitation/revoke-workforce-invitation.repo.ts';
import { makePreviewWorkforceInvitation } from '../features/workforce/invitations/preview-workforce-invitation/preview-workforce-invitation.usecase.ts';
import { makePreviewWorkforceInvitationStore } from '../features/workforce/invitations/preview-workforce-invitation/preview-workforce-invitation.repo.ts';
import { makeAcceptWorkforceInvitation } from '../features/workforce/invitations/accept-workforce-invitation/accept-workforce-invitation.usecase.ts';
import { makeAcceptWorkforceInvitationStore } from '../features/workforce/invitations/accept-workforce-invitation/accept-workforce-invitation.repo.ts';
import { makeListWorkforceInvitations } from '../features/workforce/invitations/list-workforce-invitations/list-workforce-invitations.usecase.ts';
import { makeListWorkforceInvitationsStore } from '../features/workforce/invitations/list-workforce-invitations/list-workforce-invitations.repo.ts';
import { makeListWorkforceStore } from '../features/workforce/memberships/list-workforce/list-workforce.repo.ts';
import { makeListWorkforce } from '../features/workforce/memberships/list-workforce/list-workforce.usecase.ts';
import { makeGetWorkforceMember } from '../features/workforce/memberships/get-workforce-member/get-workforce-member.usecase.ts';
import { makeGetWorkforceMemberStore } from '../features/workforce/memberships/get-workforce-member/get-workforce-member.repo.ts';
import { makeTransitionWorkforceMembership } from '../features/workforce/memberships/transition-workforce-membership/transition-workforce-membership.usecase.ts';
import { makeTransitionWorkforceMembershipStore } from '../features/workforce/memberships/transition-workforce-membership/transition-workforce-membership.repo.ts';
import { makeGrantWorkforceAccessStore } from '../features/workforce/access/grant-workforce-access/grant-workforce-access.repo.ts';
import { makeGrantWorkforceAccess } from '../features/workforce/access/grant-workforce-access/grant-workforce-access.usecase.ts';
import { makeRevokeWorkforceAccess } from '../features/workforce/access/revoke-workforce-access/revoke-workforce-access.usecase.ts';
import { makeRevokeWorkforceAccessStore } from '../features/workforce/access/revoke-workforce-access/revoke-workforce-access.repo.ts';
import {
  makeListWorkforceMemberSessions,
  type ListWorkforceMemberSessions,
} from '../features/workforce/security/list-workforce-member-sessions/list-workforce-member-sessions.usecase.ts';
import { makeListWorkforceMemberSessionsStore } from '../features/workforce/security/list-workforce-member-sessions/list-workforce-member-sessions.repo.ts';
import {
  makeRevokeWorkforceMemberSessions,
  type RevokeWorkforceMemberSessions,
} from '../features/workforce/security/revoke-workforce-member-sessions/revoke-workforce-member-sessions.usecase.ts';
import { makeRevokeWorkforceMemberSessionsStore } from '../features/workforce/security/revoke-workforce-member-sessions/revoke-workforce-member-sessions.repo.ts';
import {
  makeListWorkforceSecurityEvents,
  type ListWorkforceSecurityEvents,
} from '../features/workforce/security/list-workforce-security-events/list-workforce-security-events.usecase.ts';
import { makeListWorkforceSecurityEventsStore } from '../features/workforce/security/list-workforce-security-events/list-workforce-security-events.repo.ts';
import type { IssueWorkforceInvitation } from '../features/workforce/invitations/issue-workforce-invitation/issue-workforce-invitation.usecase.ts';
import type { ReissueWorkforceInvitation } from '../features/workforce/invitations/reissue-workforce-invitation/reissue-workforce-invitation.usecase.ts';
import type { RevokeWorkforceInvitation } from '../features/workforce/invitations/revoke-workforce-invitation/revoke-workforce-invitation.usecase.ts';
import type { PreviewWorkforceInvitation } from '../features/workforce/invitations/preview-workforce-invitation/preview-workforce-invitation.usecase.ts';
import type { AcceptWorkforceInvitation } from '../features/workforce/invitations/accept-workforce-invitation/accept-workforce-invitation.usecase.ts';
import type { ListWorkforceInvitations } from '../features/workforce/invitations/list-workforce-invitations/list-workforce-invitations.usecase.ts';
import type { ListWorkforce } from '../features/workforce/memberships/list-workforce/list-workforce.usecase.ts';
import type { GetWorkforceMember } from '../features/workforce/memberships/get-workforce-member/get-workforce-member.usecase.ts';
import type { TransitionWorkforceMembership } from '../features/workforce/memberships/transition-workforce-membership/transition-workforce-membership.usecase.ts';
import type { GrantWorkforceAccess } from '../features/workforce/access/grant-workforce-access/grant-workforce-access.usecase.ts';
import type { RevokeWorkforceAccess } from '../features/workforce/access/revoke-workforce-access/revoke-workforce-access.usecase.ts';

export type IdentityModuleDeps = Readonly<{
  db: Database;
  clock: Clock;
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
  sessions: Readonly<{
    authenticate: RequestHandler;
    readSessions: RequestHandler;
    revokeSessions: RequestHandler;
    readPrincipalIdentityId: ReadPrincipalIdentityId;
  }>;
  mfa: Readonly<{
    authenticate: RequestHandler;
    enroll: RequestHandler;
    manage: RequestHandler;
  }>;
}>;

export type IdentityModule = Readonly<{
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

export const makeIdentityModule = (
  deps: IdentityModuleDeps,
): IdentityModule => {
  const loginStore = makeLoginStore(deps.db);
  const loadSessionStore = makeLoadSessionStore(deps.db);
  const revokeSessionStore = makeRevokeSessionStore(deps.db);
  const listIdentitySessionsStore = makeListIdentitySessionsStore(deps.db);
  const revokeIdentitySessionsStore = makeRevokeIdentitySessionsStore(deps.db);
  const completeMfaChallengeStore = makeCompleteMfaChallengeStore(deps.db);
  const beginMfaEnrollmentStore = makeBeginMfaEnrollmentStore(deps.db);
  const confirmMfaEnrollmentStore = makeConfirmMfaEnrollmentStore(deps.db);
  const regenerateMfaRecoveryCodesStore = makeRegenerateMfaRecoveryCodesStore(
    deps.db,
  );
  const removeMfaStore = makeRemoveMfaStore(deps.db);
  const issueWorkforceInvitationStore = makeIssueWorkforceInvitationStore(
    deps.db,
  );
  const reissueWorkforceInvitationStore = makeReissueWorkforceInvitationStore(
    deps.db,
  );
  const revokeWorkforceInvitationStore = makeRevokeWorkforceInvitationStore(
    deps.db,
  );
  const previewWorkforceInvitationStore = makePreviewWorkforceInvitationStore(
    deps.db,
  );
  const acceptWorkforceInvitationStore = makeAcceptWorkforceInvitationStore(
    deps.db,
  );
  const listWorkforceInvitationsStore = makeListWorkforceInvitationsStore(
    deps.db,
  );
  const listWorkforceStore = makeListWorkforceStore(deps.db);
  const getWorkforceMemberStore = makeGetWorkforceMemberStore(deps.db);
  const transitionWorkforceMembershipStore =
    makeTransitionWorkforceMembershipStore(deps.db);
  const grantWorkforceAccessStore = makeGrantWorkforceAccessStore(deps.db);
  const revokeWorkforceAccessStore = makeRevokeWorkforceAccessStore(deps.db);
  const listWorkforceMemberSessionsStore = makeListWorkforceMemberSessionsStore(
    deps.db,
  );
  const revokeWorkforceMemberSessionsStore =
    makeRevokeWorkforceMemberSessionsStore(deps.db);
  const listWorkforceSecurityEventsStore = makeListWorkforceSecurityEventsStore(
    deps.db,
  );
  const tokenIssuer = makeTokenIssuer(deps.tokenSecret);
  const passwordHasher = makePasswordHasher();
  const clock = deps.clock;
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
    listIdentitySessionsStore,
  );
  const revokeIdentitySessions = makeRevokeIdentitySessions({
    store: revokeIdentitySessionsStore,
    clock,
    securityEvents,
  });
  const completeMfaChallenge = makeCompleteMfaChallenge({
    store: completeMfaChallengeStore,
    tokenService: tokenIssuer,
    totp,
    secretBox,
    recoveryCodes,
    clock,
    sessionTtlMinutes: deps.sessionTtlMinutes,
    securityEvents,
  });
  const beginMfaEnrollment = makeBeginMfaEnrollment({
    store: beginMfaEnrollmentStore,
    totp,
    secretBox,
    clock,
    issuer: deps.mfaIssuer,
    securityEvents,
  });
  const confirmMfaEnrollment = makeConfirmMfaEnrollment({
    store: confirmMfaEnrollmentStore,
    totp,
    secretBox,
    recoveryCodes,
    clock,
    securityEvents,
  });
  const regenerateMfaRecoveryCodes = makeRegenerateMfaRecoveryCodes({
    store: regenerateMfaRecoveryCodesStore,
    recoveryCodes,
    clock,
    securityEvents,
  });
  const removeMfa = makeRemoveMfa({
    store: removeMfaStore,
    clock,
    securityEvents,
  });
  const invitationDeps = {
    tokenService: tokenIssuer,
    clock,
    invitationTtlMinutes: deps.workforceInvitationTtlMinutes ?? 72 * 60,
  };
  const workforce: WorkforceApplication = {
    issueInvitation: makeIssueWorkforceInvitation({
      ...invitationDeps,
      store: issueWorkforceInvitationStore,
    }),
    reissueInvitation: makeReissueWorkforceInvitation({
      ...invitationDeps,
      store: reissueWorkforceInvitationStore,
    }),
    revokeInvitation: makeRevokeWorkforceInvitation({
      store: revokeWorkforceInvitationStore,
      clock,
    }),
    previewInvitation: makePreviewWorkforceInvitation({
      store: previewWorkforceInvitationStore,
      tokenService: tokenIssuer,
      clock,
    }),
    acceptInvitation: makeAcceptWorkforceInvitation({
      store: acceptWorkforceInvitationStore,
      tokenService: tokenIssuer,
      passwordHasher,
      clock,
    }),
    listInvitations: makeListWorkforceInvitations({
      store: listWorkforceInvitationsStore,
      clock,
    }),
    listWorkforce: makeListWorkforce({
      store: listWorkforceStore,
      clock,
    }),
    getWorkforceMember: makeGetWorkforceMember({
      store: getWorkforceMemberStore,
      clock,
    }),
    suspendMembership: makeTransitionWorkforceMembership({
      store: transitionWorkforceMembershipStore,
      clock,
      event: 'suspend',
    }),
    reactivateMembership: makeTransitionWorkforceMembership({
      store: transitionWorkforceMembershipStore,
      clock,
      event: 'reactivate',
    }),
    endMembership: makeTransitionWorkforceMembership({
      store: transitionWorkforceMembershipStore,
      clock,
      event: 'end',
    }),
    grantAccess: makeGrantWorkforceAccess({
      store: grantWorkforceAccessStore,
      clock,
    }),
    revokeAccess: makeRevokeWorkforceAccess({
      store: revokeWorkforceAccessStore,
      clock,
    }),
    listMemberSessions: makeListWorkforceMemberSessions({
      store: listWorkforceMemberSessionsStore,
      clock,
    }),
    revokeMemberSessions: makeRevokeWorkforceMemberSessions({
      store: revokeWorkforceMemberSessionsStore,
      clock,
    }),
    listSecurityEvents: makeListWorkforceSecurityEvents({
      store: listWorkforceSecurityEventsStore,
      clock,
    }),
  };

  const routes = Router();

  routes.use('/login', makeLoginRoute(login));
  routes.use('/session', makeLoadSessionRouter({ loadSession }));
  routes.use('/logout', makeRevokeSessionRouter({ revokeSession }));
  routes.use('/mfa', makeCompleteMfaChallengeRouter(completeMfaChallenge));

  const makeAdministrationRoutes = (
    security: AuthAdministrationSecurity,
  ): ExpressRouter => {
    const administrationRoutes = Router();

    administrationRoutes.use(
      '/',
      makeListIdentitySessionsRouter({
        listIdentitySessions,
        authenticate: security.sessions.authenticate,
        authorize: security.sessions.readSessions,
      }),
    );
    administrationRoutes.use(
      '/',
      makeRevokeIdentitySessionsRouter({
        revokeIdentitySessions,
        authenticate: security.sessions.authenticate,
        authorize: security.sessions.revokeSessions,
        readPrincipalIdentityId: security.sessions.readPrincipalIdentityId,
      }),
    );
    administrationRoutes.use(
      '/mfa',
      makeBeginMfaEnrollmentRouter({
        beginMfaEnrollment,
        authenticate: security.mfa.authenticate,
        authorize: security.mfa.enroll,
      }),
    );
    administrationRoutes.use(
      '/mfa',
      makeConfirmMfaEnrollmentRouter({
        confirmMfaEnrollment,
        authenticate: security.mfa.authenticate,
        authorize: security.mfa.enroll,
      }),
    );
    administrationRoutes.use(
      '/mfa',
      makeRegenerateMfaRecoveryCodesRouter({
        regenerateMfaRecoveryCodes,
        authenticate: security.mfa.authenticate,
        authorize: security.mfa.manage,
      }),
    );
    administrationRoutes.use(
      '/mfa',
      makeRemoveMfaRouter({
        removeMfa,
        authenticate: security.mfa.authenticate,
        authorize: security.mfa.manage,
      }),
    );

    return administrationRoutes;
  };

  return {
    routes,
    guards: {
      authenticate: makeAuthenticateMiddleware(loadSession),
      authorize: makeAuthorizeMiddleware({ clock, securityEvents }),
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
