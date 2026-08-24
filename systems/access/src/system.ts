import {
  makePasswordHasher,
  makePasswordVerifier,
} from '@pressly/auth-platform/passwords';
import { makeRecoveryCodeService } from '@pressly/auth-platform/recovery-codes';
import { makeSecretBox } from '@pressly/auth-platform/secret-box';
import { makeTokenIssuer } from '@pressly/auth-platform/tokens';
import { makeTotpAuthenticator } from '@pressly/auth-platform/totp';
import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import {
  defineResultUnitOfWork,
  defineUnitOfWork,
} from '@pressly/postgres/unit-of-work';
import type { ResultUnitOfWork, UnitOfWork } from '@pressly/cells/unit-of-work';
import {
  nullSecurityEventSink,
  type SecurityEventSink,
} from '@pressly/logging';
import {
  observeResultUnitOfWork,
  observeUnitOfWork,
  type TransactionOperation,
  type UnitOfWorkObservation,
} from '@pressly/observability';
import type { Clock } from '@pressly/time';
import {
  invalidEncryptedSecretEnvelope,
  invalidMfaEncryptionKey,
  passwordHashingFailed,
  passwordVerificationFailed,
} from './credential-mechanism-failures.ts';
import { makeAccessAuthorization } from './authorization.ts';
import { makeOrderLocationFactsV1Capability } from './capabilities/order-location-facts-v1.postgres.ts';
import { makeAccessProductionCapabilities } from './assembly/production-capabilities.postgres.ts';
import { makeProductionLocationAuthority } from './assembly/production-location-authority.ts';
import { makeBootstrapOwnerCell } from './cells/bootstrap/bootstrap-owner/cell.ts';
import { makeBootstrapOwnerStore } from './cells/bootstrap/bootstrap-owner/bootstrap-owner.repo.ts';
import { makeBootstrapOwner } from './cells/bootstrap/bootstrap-owner/bootstrap-owner.usecase.ts';
import { makeBeginMfaEnrollmentCell } from './cells/mfa/begin-mfa-enrollment/cell.ts';
import { makeBeginMfaEnrollmentStore } from './cells/mfa/begin-mfa-enrollment/begin-mfa-enrollment.repo.ts';
import { makeBeginMfaEnrollment } from './cells/mfa/begin-mfa-enrollment/begin-mfa-enrollment.usecase.ts';
import { makeCompleteMfaChallengeCell } from './cells/mfa/complete-mfa-challenge/cell.ts';
import { makeCompleteMfaChallengeStore } from './cells/mfa/complete-mfa-challenge/complete-mfa-challenge.repo.ts';
import { makeCompleteMfaChallenge } from './cells/mfa/complete-mfa-challenge/complete-mfa-challenge.usecase.ts';
import { makeConfirmMfaEnrollmentCell } from './cells/mfa/confirm-mfa-enrollment/cell.ts';
import { makeConfirmMfaEnrollmentStore } from './cells/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.repo.ts';
import { makeConfirmMfaEnrollment } from './cells/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.usecase.ts';
import { makeRegenerateMfaRecoveryCodesCell } from './cells/mfa/regenerate-mfa-recovery-codes/cell.ts';
import { makeRegenerateMfaRecoveryCodesStore } from './cells/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.repo.ts';
import { makeRegenerateMfaRecoveryCodes } from './cells/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.usecase.ts';
import { makeRemoveMfaCell } from './cells/mfa/remove-mfa/cell.ts';
import { makeRemoveMfaStore } from './cells/mfa/remove-mfa/remove-mfa.repo.ts';
import { makeRemoveMfa } from './cells/mfa/remove-mfa/remove-mfa.usecase.ts';
import { makeListIdentitySessionsCell } from './cells/sessions/list-identity-sessions/cell.ts';
import { makeListIdentitySessionsStore } from './cells/sessions/list-identity-sessions/list-identity-sessions.repo.ts';
import { makeListIdentitySessions } from './cells/sessions/list-identity-sessions/list-identity-sessions.usecase.ts';
import { makeLoadSessionCell } from './cells/sessions/load-session/cell.ts';
import { makeLoadSessionStore } from './cells/sessions/load-session/load-session.repo.ts';
import { makeLoadSession } from './cells/sessions/load-session/load-session.usecase.ts';
import { makeLoginCell } from './cells/sessions/login/cell.ts';
import { makeLoginStore } from './cells/sessions/login/login.repo.ts';
import { makeLogin } from './cells/sessions/login/login.usecase.ts';
import { makeRevokeIdentitySessionsCell } from './cells/sessions/revoke-identity-sessions/cell.ts';
import { makeRevokeIdentitySessionsStore } from './cells/sessions/revoke-identity-sessions/revoke-identity-sessions.repo.ts';
import { makeRevokeIdentitySessions } from './cells/sessions/revoke-identity-sessions/revoke-identity-sessions.usecase.ts';
import { makeRevokeSessionCell } from './cells/sessions/revoke-session/cell.ts';
import { makeRevokeSessionStore } from './cells/sessions/revoke-session/revoke-session.repo.ts';
import { makeRevokeSession } from './cells/sessions/revoke-session/revoke-session.usecase.ts';
import { makeListActiveBusinessLocationsCell } from './cells/scopes/list-active-business-locations/cell.ts';
import { makeListActiveBusinessLocationsStore } from './cells/scopes/list-active-business-locations/list-active-business-locations.repo.ts';
import { makeListActiveBusinessLocations } from './cells/scopes/list-active-business-locations/list-active-business-locations.usecase.ts';
import { makeListActiveProductionLocationsCell } from './cells/scopes/list-active-production-locations/cell.ts';
import { makeListActiveProductionLocationsStore } from './cells/scopes/list-active-production-locations/list-active-production-locations.repo.ts';
import { makeListActiveProductionLocations } from './cells/scopes/list-active-production-locations/list-active-production-locations.usecase.ts';
import { makeListEffectiveAccessGrantsCell } from './cells/scopes/list-effective-access-grants/cell.ts';
import { makeListEffectiveAccessGrantsStore } from './cells/scopes/list-effective-access-grants/list-effective-access-grants.repo.ts';
import { makeListEffectiveAccessGrants } from './cells/scopes/list-effective-access-grants/list-effective-access-grants.usecase.ts';
import { makeResolveLocationAncestryCell } from './cells/scopes/resolve-location-ancestry/cell.ts';
import { makeResolveProductionVisibilityCell } from './cells/scopes/resolve-production-visibility/cell.ts';
import { makeGrantWorkforceAccessCell } from './cells/workforce/access/grant-workforce-access/cell.ts';
import { makeGrantWorkforceAccessStore } from './cells/workforce/access/grant-workforce-access/grant-workforce-access.repo.ts';
import { makeGrantWorkforceAccess } from './cells/workforce/access/grant-workforce-access/grant-workforce-access.usecase.ts';
import { makeRevokeWorkforceAccessCell } from './cells/workforce/access/revoke-workforce-access/cell.ts';
import { makeRevokeWorkforceAccessStore } from './cells/workforce/access/revoke-workforce-access/revoke-workforce-access.repo.ts';
import { makeRevokeWorkforceAccess } from './cells/workforce/access/revoke-workforce-access/revoke-workforce-access.usecase.ts';
import { makeAcceptWorkforceInvitationCell } from './cells/workforce/invitations/accept-workforce-invitation/cell.ts';
import { makeAcceptWorkforceInvitationStore } from './cells/workforce/invitations/accept-workforce-invitation/accept-workforce-invitation.repo.ts';
import { makeAcceptWorkforceInvitation } from './cells/workforce/invitations/accept-workforce-invitation/accept-workforce-invitation.usecase.ts';
import { makeIssueWorkforceInvitationCell } from './cells/workforce/invitations/issue-workforce-invitation/cell.ts';
import { makeIssueWorkforceInvitationStore } from './cells/workforce/invitations/issue-workforce-invitation/issue-workforce-invitation.repo.ts';
import { makeIssueWorkforceInvitation } from './cells/workforce/invitations/issue-workforce-invitation/issue-workforce-invitation.usecase.ts';
import { makeListWorkforceInvitationsCell } from './cells/workforce/invitations/list-workforce-invitations/cell.ts';
import { makeListWorkforceInvitationsStore } from './cells/workforce/invitations/list-workforce-invitations/list-workforce-invitations.repo.ts';
import { makeListWorkforceInvitations } from './cells/workforce/invitations/list-workforce-invitations/list-workforce-invitations.usecase.ts';
import { makePreviewWorkforceInvitationCell } from './cells/workforce/invitations/preview-workforce-invitation/cell.ts';
import { makePreviewWorkforceInvitationStore } from './cells/workforce/invitations/preview-workforce-invitation/preview-workforce-invitation.repo.ts';
import { makePreviewWorkforceInvitation } from './cells/workforce/invitations/preview-workforce-invitation/preview-workforce-invitation.usecase.ts';
import { makeReissueWorkforceInvitationCell } from './cells/workforce/invitations/reissue-workforce-invitation/cell.ts';
import { makeReissueWorkforceInvitationStore } from './cells/workforce/invitations/reissue-workforce-invitation/reissue-workforce-invitation.repo.ts';
import { makeReissueWorkforceInvitation } from './cells/workforce/invitations/reissue-workforce-invitation/reissue-workforce-invitation.usecase.ts';
import { makeRevokeWorkforceInvitationCell } from './cells/workforce/invitations/revoke-workforce-invitation/cell.ts';
import { makeRevokeWorkforceInvitationStore } from './cells/workforce/invitations/revoke-workforce-invitation/revoke-workforce-invitation.repo.ts';
import { makeRevokeWorkforceInvitation } from './cells/workforce/invitations/revoke-workforce-invitation/revoke-workforce-invitation.usecase.ts';
import { makeGetWorkforceMemberCell } from './cells/workforce/memberships/get-workforce-member/cell.ts';
import { makeGetWorkforceMemberStore } from './cells/workforce/memberships/get-workforce-member/get-workforce-member.repo.ts';
import { makeGetWorkforceMember } from './cells/workforce/memberships/get-workforce-member/get-workforce-member.usecase.ts';
import { makeListWorkforceCell } from './cells/workforce/memberships/list-workforce/cell.ts';
import { makeListWorkforceStore } from './cells/workforce/memberships/list-workforce/list-workforce.repo.ts';
import { makeListWorkforce } from './cells/workforce/memberships/list-workforce/list-workforce.usecase.ts';
import { makeTransitionWorkforceMembershipCell } from './cells/workforce/memberships/transition-workforce-membership/cell.ts';
import { makeTransitionWorkforceMembershipStore } from './cells/workforce/memberships/transition-workforce-membership/transition-workforce-membership.repo.ts';
import {
  combineWorkforceMembershipTransitions,
  makeTransitionWorkforceMembership,
} from './cells/workforce/memberships/transition-workforce-membership/transition-workforce-membership.usecase.ts';
import { makeListWorkforceMemberSessionsCell } from './cells/workforce/security/list-workforce-member-sessions/cell.ts';
import { makeListWorkforceMemberSessionsStore } from './cells/workforce/security/list-workforce-member-sessions/list-workforce-member-sessions.repo.ts';
import { makeListWorkforceMemberSessions } from './cells/workforce/security/list-workforce-member-sessions/list-workforce-member-sessions.usecase.ts';
import { makeListWorkforceSecurityEventsCell } from './cells/workforce/security/list-workforce-security-events/cell.ts';
import { makeListWorkforceSecurityEventsStore } from './cells/workforce/security/list-workforce-security-events/list-workforce-security-events.repo.ts';
import { makeListWorkforceSecurityEvents } from './cells/workforce/security/list-workforce-security-events/list-workforce-security-events.usecase.ts';
import { makeRevokeWorkforceMemberSessionsCell } from './cells/workforce/security/revoke-workforce-member-sessions/cell.ts';
import { makeRevokeWorkforceMemberSessionsStore } from './cells/workforce/security/revoke-workforce-member-sessions/revoke-workforce-member-sessions.repo.ts';
import { makeRevokeWorkforceMemberSessions } from './cells/workforce/security/revoke-workforce-member-sessions/revoke-workforce-member-sessions.usecase.ts';
import { makePostgresLocationAncestry } from './postgres/location-ancestry/location-ancestry.postgres.ts';
import type { AccessSchema } from './schema/public.ts';

export type AccessSystemDependencies = Readonly<{
  db: PostgresDatabase;
  schema: AccessSchema;
  clock: Clock;
  tokenSecret: string;
  sessionTtlMinutes: number;
  loginWindowMinutes: number;
  loginMaxFailures: number;
  mfaChallengeTtlMinutes: number;
  mfaChallengeMaxAttempts: number;
  sessionIdleTimeoutMinutes: number;
  securityEvents?: SecurityEventSink;
  mfaEncryptionKey: string;
  mfaIssuer: string;
  workforceInvitationTtlMinutes?: number;
  transactions?: Omit<UnitOfWorkObservation, 'operation'>;
  policies: Readonly<{
    pricing: Readonly<{ freshSessionMaxAgeMinutes: number }>;
    authSessions: Readonly<{ freshSessionMaxAgeMinutes: number }>;
    mfa: Readonly<{ freshSessionMaxAgeMinutes: number }>;
  }>;
}>;

const makeAccessUnitOfWork = (
  deps: AccessSystemDependencies,
  operation: TransactionOperation,
): UnitOfWork<PostgresTransaction> => {
  const unitOfWork = defineUnitOfWork(deps.db, (transaction) => transaction);

  return deps.transactions === undefined
    ? unitOfWork
    : observeUnitOfWork({ ...deps.transactions, operation, unitOfWork });
};

const makeAccessResultUnitOfWork = (
  deps: AccessSystemDependencies,
  operation: TransactionOperation,
): ResultUnitOfWork<PostgresTransaction> => {
  const unitOfWork = defineResultUnitOfWork(
    deps.db,
    (transaction) => transaction,
  );

  return deps.transactions === undefined
    ? unitOfWork
    : observeResultUnitOfWork({ ...deps.transactions, operation, unitOfWork });
};

export const makeAccessSystem = (deps: AccessSystemDependencies) => {
  const productionCapabilities = makeAccessProductionCapabilities(
    deps.db,
    deps.schema,
  );
  const reconcileProductionLocation = makeProductionLocationAuthority({
    db: deps.db,
    schema: deps.schema,
    clock: deps.clock,
  });
  const tokenIssuer = makeTokenIssuer(deps.tokenSecret);
  const passwordHasher = makePasswordHasher({
    hashFailure: passwordHashingFailed,
  });
  const passwordVerifier = makePasswordVerifier({
    verificationFailure: passwordVerificationFailed,
  });
  const totp = makeTotpAuthenticator();
  const secretBox = makeSecretBox(deps.mfaEncryptionKey, {
    invalidKey: invalidMfaEncryptionKey,
    invalidEnvelope: invalidEncryptedSecretEnvelope,
  });
  const recoveryCodes = makeRecoveryCodeService();
  const securityEvents = deps.securityEvents ?? nullSecurityEventSink;
  const ancestry = makePostgresLocationAncestry(deps.db, deps.schema);
  const authorization = makeAccessAuthorization({
    locationAncestry: ancestry,
    clock: deps.clock,
    policies: deps.policies,
  });
  const bootstrapOwner = makeBootstrapOwner({
    store: makeBootstrapOwnerStore(deps.db, deps.schema),
    passwordHasher,
    passwordVerifier,
  });

  const sessions = Object.freeze({
    login: makeLogin({
      store: makeLoginStore(deps.db, deps.schema),
      passwordVerifier,
      tokenIssuer,
      clock: deps.clock,
      options: {
        sessionTtlMinutes: deps.sessionTtlMinutes,
        loginWindowMinutes: deps.loginWindowMinutes,
        loginMaxFailures: deps.loginMaxFailures,
        mfaChallengeTtlMinutes: deps.mfaChallengeTtlMinutes,
      },
      securityEvents,
    }),
    loadSession: makeLoadSession({
      store: makeLoadSessionStore(deps.db, deps.schema),
      tokenHasher: tokenIssuer,
      clock: deps.clock,
      idleTimeoutMinutes: deps.sessionIdleTimeoutMinutes,
    }),
    revokeSession: makeRevokeSession({
      store: makeRevokeSessionStore(deps.db, deps.schema),
      tokenHasher: tokenIssuer,
      clock: deps.clock,
      securityEvents,
    }),
    listIdentitySessions: makeListIdentitySessions(
      makeListIdentitySessionsStore(deps.db, deps.schema),
    ),
    revokeIdentitySessions: makeRevokeIdentitySessions({
      store: makeRevokeIdentitySessionsStore(deps.db, deps.schema),
      clock: deps.clock,
      securityEvents,
    }),
  });

  const mfa = Object.freeze({
    beginEnrollment: makeBeginMfaEnrollment({
      store: makeBeginMfaEnrollmentStore(deps.db, deps.schema),
      totp,
      secretBox,
      clock: deps.clock,
      issuer: deps.mfaIssuer,
      securityEvents,
    }),
    confirmEnrollment: makeConfirmMfaEnrollment({
      store: makeConfirmMfaEnrollmentStore(
        deps.db,
        deps.schema,
        makeAccessResultUnitOfWork(deps, 'identity.confirm_mfa_enrollment'),
      ),
      totp,
      secretBox,
      recoveryCodes,
      clock: deps.clock,
      securityEvents,
    }),
    completeChallenge: makeCompleteMfaChallenge({
      store: makeCompleteMfaChallengeStore(
        deps.db,
        deps.schema,
        makeAccessResultUnitOfWork(deps, 'identity.complete_mfa_challenge'),
      ),
      tokenService: tokenIssuer,
      totp,
      secretBox,
      recoveryCodes,
      clock: deps.clock,
      sessionTtlMinutes: deps.sessionTtlMinutes,
      maxAttempts: deps.mfaChallengeMaxAttempts,
      securityEvents,
    }),
    regenerateRecoveryCodes: makeRegenerateMfaRecoveryCodes({
      store: makeRegenerateMfaRecoveryCodesStore(
        deps.db,
        deps.schema,
        makeAccessUnitOfWork(deps, 'identity.regenerate_mfa_recovery_codes'),
      ),
      recoveryCodes,
      clock: deps.clock,
      securityEvents,
    }),
    remove: makeRemoveMfa({
      store: makeRemoveMfaStore(
        deps.db,
        deps.schema,
        makeAccessUnitOfWork(deps, 'identity.remove_mfa'),
      ),
      clock: deps.clock,
      securityEvents,
    }),
  });

  const invitationDependencies = {
    tokenService: tokenIssuer,
    clock: deps.clock,
    invitationTtlMinutes: deps.workforceInvitationTtlMinutes ?? 72 * 60,
  };
  const workforce = Object.freeze({
    issueInvitation: makeIssueWorkforceInvitation({
      ...invitationDependencies,
      store: makeIssueWorkforceInvitationStore(deps.db, deps.schema),
    }),
    reissueInvitation: makeReissueWorkforceInvitation({
      ...invitationDependencies,
      store: makeReissueWorkforceInvitationStore(deps.db, deps.schema),
    }),
    revokeInvitation: makeRevokeWorkforceInvitation({
      store: makeRevokeWorkforceInvitationStore(deps.db, deps.schema),
      clock: deps.clock,
    }),
    previewInvitation: makePreviewWorkforceInvitation({
      store: makePreviewWorkforceInvitationStore(deps.db, deps.schema),
      tokenService: tokenIssuer,
      clock: deps.clock,
    }),
    acceptInvitation: makeAcceptWorkforceInvitation({
      store: makeAcceptWorkforceInvitationStore(deps.db, deps.schema),
      tokenService: tokenIssuer,
      passwordHasher,
      clock: deps.clock,
    }),
    listInvitations: makeListWorkforceInvitations({
      store: makeListWorkforceInvitationsStore(deps.db, deps.schema),
      clock: deps.clock,
    }),
    listWorkforce: makeListWorkforce({
      store: makeListWorkforceStore(deps.db, deps.schema),
      clock: deps.clock,
    }),
    getWorkforceMember: makeGetWorkforceMember({
      store: makeGetWorkforceMemberStore(deps.db, deps.schema),
      clock: deps.clock,
    }),
    suspendMembership: makeTransitionWorkforceMembership({
      store: makeTransitionWorkforceMembershipStore(
        deps.db,
        deps.schema,
        makeAccessUnitOfWork(deps, 'identity.suspend_workforce_membership'),
      ),
      clock: deps.clock,
      event: 'suspend',
    }),
    reactivateMembership: makeTransitionWorkforceMembership({
      store: makeTransitionWorkforceMembershipStore(
        deps.db,
        deps.schema,
        makeAccessUnitOfWork(deps, 'identity.reactivate_workforce_membership'),
      ),
      clock: deps.clock,
      event: 'reactivate',
    }),
    endMembership: makeTransitionWorkforceMembership({
      store: makeTransitionWorkforceMembershipStore(
        deps.db,
        deps.schema,
        makeAccessUnitOfWork(deps, 'identity.end_workforce_membership'),
      ),
      clock: deps.clock,
      event: 'end',
    }),
    grantAccess: makeGrantWorkforceAccess({
      store: makeGrantWorkforceAccessStore(
        deps.db,
        deps.schema,
        makeAccessUnitOfWork(deps, 'identity.grant_workforce_access'),
      ),
      clock: deps.clock,
    }),
    revokeAccess: makeRevokeWorkforceAccess({
      store: makeRevokeWorkforceAccessStore(
        deps.db,
        deps.schema,
        makeAccessUnitOfWork(deps, 'identity.revoke_workforce_access'),
      ),
      clock: deps.clock,
    }),
    listMemberSessions: makeListWorkforceMemberSessions({
      store: makeListWorkforceMemberSessionsStore(deps.db, deps.schema),
      clock: deps.clock,
    }),
    revokeMemberSessions: makeRevokeWorkforceMemberSessions({
      store: makeRevokeWorkforceMemberSessionsStore(deps.db, deps.schema),
      clock: deps.clock,
    }),
    listSecurityEvents: makeListWorkforceSecurityEvents({
      store: makeListWorkforceSecurityEventsStore(deps.db, deps.schema),
      clock: deps.clock,
    }),
  });
  const transitionWorkforceMembership = combineWorkforceMembershipTransitions({
    suspend: workforce.suspendMembership,
    reactivate: workforce.reactivateMembership,
    end: workforce.endMembership,
  });
  const listEffectiveAccessGrants = makeListEffectiveAccessGrants({
    store: makeListEffectiveAccessGrantsStore(deps.db, deps.schema),
    clock: deps.clock,
  });
  const listActiveBusinessLocations = makeListActiveBusinessLocations(
    makeListActiveBusinessLocationsStore(deps.db, deps.schema),
  );
  const listActiveProductionLocations = makeListActiveProductionLocations(
    makeListActiveProductionLocationsStore(deps.db, deps.schema),
  );

  return Object.freeze({
    cells: Object.freeze({
      reconcileProductionLocation,
      bootstrapOwner: makeBootstrapOwnerCell(bootstrapOwner),
      beginMfaEnrollment: makeBeginMfaEnrollmentCell(mfa.beginEnrollment),
      completeMfaChallenge: makeCompleteMfaChallengeCell(mfa.completeChallenge),
      confirmMfaEnrollment: makeConfirmMfaEnrollmentCell(mfa.confirmEnrollment),
      regenerateMfaRecoveryCodes: makeRegenerateMfaRecoveryCodesCell(
        mfa.regenerateRecoveryCodes,
      ),
      removeMfa: makeRemoveMfaCell(mfa.remove),
      listIdentitySessions: makeListIdentitySessionsCell(
        sessions.listIdentitySessions,
      ),
      loadSession: makeLoadSessionCell(sessions.loadSession),
      login: makeLoginCell(sessions.login),
      revokeIdentitySessions: makeRevokeIdentitySessionsCell(
        sessions.revokeIdentitySessions,
      ),
      revokeSession: makeRevokeSessionCell(sessions.revokeSession),
      listEffectiveAccessGrants: makeListEffectiveAccessGrantsCell(
        listEffectiveAccessGrants,
      ),
      listActiveBusinessLocations: makeListActiveBusinessLocationsCell(
        listActiveBusinessLocations,
      ),
      listActiveProductionLocations: makeListActiveProductionLocationsCell(
        listActiveProductionLocations,
      ),
      grantWorkforceAccess: makeGrantWorkforceAccessCell(workforce.grantAccess),
      revokeWorkforceAccess: makeRevokeWorkforceAccessCell(
        workforce.revokeAccess,
      ),
      acceptWorkforceInvitation: makeAcceptWorkforceInvitationCell(
        workforce.acceptInvitation,
      ),
      issueWorkforceInvitation: makeIssueWorkforceInvitationCell(
        workforce.issueInvitation,
      ),
      listWorkforceInvitations: makeListWorkforceInvitationsCell(
        workforce.listInvitations,
      ),
      previewWorkforceInvitation: makePreviewWorkforceInvitationCell(
        workforce.previewInvitation,
      ),
      reissueWorkforceInvitation: makeReissueWorkforceInvitationCell(
        workforce.reissueInvitation,
      ),
      revokeWorkforceInvitation: makeRevokeWorkforceInvitationCell(
        workforce.revokeInvitation,
      ),
      getWorkforceMember: makeGetWorkforceMemberCell(
        workforce.getWorkforceMember,
      ),
      listWorkforce: makeListWorkforceCell(workforce.listWorkforce),
      transitionWorkforceMembership: makeTransitionWorkforceMembershipCell(
        transitionWorkforceMembership,
      ),
      listWorkforceMemberSessions: makeListWorkforceMemberSessionsCell(
        workforce.listMemberSessions,
      ),
      listWorkforceSecurityEvents: makeListWorkforceSecurityEventsCell(
        workforce.listSecurityEvents,
      ),
      revokeWorkforceMemberSessions: makeRevokeWorkforceMemberSessionsCell(
        workforce.revokeMemberSessions,
      ),
      resolveLocationAncestry: makeResolveLocationAncestryCell(
        authorization.resolveLocationAncestry,
      ),
      resolveProductionVisibility: makeResolveProductionVisibilityCell(
        authorization.resolveProductionVisibility,
      ),
    }),
    policies: authorization.policies,
    resources: authorization.resources,
    capabilities: Object.freeze({
      orderLocationFactsV1: makeOrderLocationFactsV1Capability(
        deps.db,
        deps.schema,
      ),
      ...productionCapabilities,
    }),
    productionCapabilitiesForLocation:
      authorization.productionCapabilitiesForLocation,
  });
};

export type AccessSystem = ReturnType<typeof makeAccessSystem>;
