/* This file is generated from the checked deployment topology. */
export const controlAcceptExistingInvitationMfaV1 = {
  operationId: 'control.accept-existing-invitation-mfa.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    mfa: { method: 'POST', path: '/control/invitations/accept/existing/mfa' },
  },
} as const;

export const controlAcceptExistingInvitationPasswordV1 = {
  operationId: 'control.accept-existing-invitation-password.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    password: {
      method: 'POST',
      path: '/control/invitations/accept/existing/password',
    },
  },
} as const;

export const controlAcceptExistingInvitationV1 = {
  operationId: 'control.accept-existing-invitation.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    existing: { method: 'POST', path: '/control/invitations/accept/existing' },
  },
} as const;

export const controlAcceptNewInvitationV1 = {
  operationId: 'control.accept-new-invitation.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    new: { method: 'POST', path: '/control/invitations/accept/new' },
  },
} as const;

export const controlAuthLoginV1 = {
  operationId: 'control.auth-login.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    login: { method: 'POST', path: '/control/auth/login' },
  },
} as const;

export const controlBeginMfaEnrollmentV1 = {
  operationId: 'control.begin-mfa-enrollment.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    enrollment: { method: 'POST', path: '/control/auth/mfa/enrollment' },
  },
} as const;

export const controlCliAuthApiBeginMfaEnrollmentV1 = {
  operationId: 'control.cli-auth-api-begin-mfa-enrollment.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    enrollment: { method: 'POST', path: '/control/cli/auth/mfa/enrollment' },
  },
} as const;

export const controlCliAuthApiCompleteMfaChallengeV1 = {
  operationId: 'control.cli-auth-api-complete-mfa-challenge.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    challenge: { method: 'POST', path: '/control/cli/auth/mfa/challenge' },
  },
} as const;

export const controlCliAuthApiConfirmMfaEnrollmentV1 = {
  operationId: 'control.cli-auth-api-confirm-mfa-enrollment.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    confirm: {
      method: 'POST',
      path: '/control/cli/auth/mfa/enrollment/confirm',
    },
  },
} as const;

export const controlCliAuthApiLoadSessionV1 = {
  operationId: 'control.cli-auth-api-load-session.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    session: { method: 'GET', path: '/control/cli/auth/session' },
  },
} as const;

export const controlCliAuthApiLoginV1 = {
  operationId: 'control.cli-auth-api-login.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    login: { method: 'POST', path: '/control/cli/auth/login' },
  },
} as const;

export const controlCliAuthApiLogoutV1 = {
  operationId: 'control.cli-auth-api-logout.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    logout: { method: 'POST', path: '/control/cli/auth/logout' },
  },
} as const;

export const controlCliAuthApiRegenerateMfaRecoveryCodesV1 = {
  operationId: 'control.cli-auth-api-regenerate-mfa-recovery-codes.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    regenerate: {
      method: 'POST',
      path: '/control/cli/auth/mfa/recovery-codes/regenerate',
    },
  },
} as const;

export const controlCliAuthApiRemoveMfaV1 = {
  operationId: 'control.cli-auth-api-remove-mfa.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    remove: { method: 'POST', path: '/control/cli/auth/mfa/remove' },
  },
} as const;

export const controlCompleteMfaChallengeV1 = {
  operationId: 'control.complete-mfa-challenge.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    challenge: { method: 'POST', path: '/control/auth/mfa/challenge' },
  },
} as const;

export const controlConfirmMfaEnrollmentV1 = {
  operationId: 'control.confirm-mfa-enrollment.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    confirm: { method: 'POST', path: '/control/auth/mfa/enrollment/confirm' },
  },
} as const;

export const controlCorrectOrderV1 = {
  operationId: 'control.correct-order.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    request: { method: 'PATCH', path: '/control/orders/:orderId' },
  },
} as const;

export const controlCreateCustomerV1 = {
  operationId: 'control.create-customer.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    customers: { method: 'POST', path: '/control/customers' },
  },
} as const;

export const controlCreateOrderV1 = {
  operationId: 'control.create-order.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    orders: { method: 'POST', path: '/control/orders' },
  },
} as const;

export const controlEndMembershipV1 = {
  operationId: 'control.end-membership.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    end: { method: 'POST', path: '/control/team/:membershipId/end' },
  },
} as const;

export const controlGetCustomerV1 = {
  operationId: 'control.get-customer.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    request: { method: 'GET', path: '/control/customers/:userId' },
  },
} as const;

export const controlGetMemberV1 = {
  operationId: 'control.get-member.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    request: { method: 'GET', path: '/control/team/:membershipId' },
  },
} as const;

export const controlGetOrderV1 = {
  operationId: 'control.get-order.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    request: { method: 'GET', path: '/control/orders/:orderId' },
  },
} as const;

export const controlGrantAccessV1 = {
  operationId: 'control.grant-access.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    grants: { method: 'POST', path: '/control/team/:membershipId/grants' },
  },
} as const;

export const controlIssueInvitationV1 = {
  operationId: 'control.issue-invitation.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    invitations: { method: 'POST', path: '/control/invitations' },
  },
} as const;

export const controlListCustomersV1 = {
  operationId: 'control.list-customers.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    customers: { method: 'GET', path: '/control/customers' },
  },
} as const;

export const controlListIdentitySessionsV1 = {
  operationId: 'control.list-identity-sessions.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    sessions: {
      method: 'GET',
      path: '/control/auth/identities/:identityId/sessions',
    },
  },
} as const;

export const controlListInvitationsV1 = {
  operationId: 'control.list-invitations.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    invitations: { method: 'GET', path: '/control/invitations' },
  },
} as const;

export const controlListMemberSessionsV1 = {
  operationId: 'control.list-member-sessions.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    sessions: { method: 'GET', path: '/control/team/:membershipId/sessions' },
  },
} as const;

export const controlListMembersV1 = {
  operationId: 'control.list-members.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    team: { method: 'GET', path: '/control/team' },
  },
} as const;

export const controlListOrdersV1 = {
  operationId: 'control.list-orders.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    orders: { method: 'GET', path: '/control/orders' },
  },
} as const;

export const controlListSecurityEventsV1 = {
  operationId: 'control.list-security-events.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    events: { method: 'GET', path: '/control/security/events' },
  },
} as const;

export const controlLoadAuthSessionV1 = {
  operationId: 'control.load-auth-session.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    session: { method: 'GET', path: '/control/auth/session' },
  },
} as const;

export const controlLogoutV1 = {
  operationId: 'control.logout.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    logout: { method: 'POST', path: '/control/auth/logout' },
  },
} as const;

export const controlPreviewInvitationV1 = {
  operationId: 'control.preview-invitation.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    preview: { method: 'POST', path: '/control/invitations/preview' },
  },
} as const;

export const controlReactivateMembershipV1 = {
  operationId: 'control.reactivate-membership.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    reactivate: {
      method: 'POST',
      path: '/control/team/:membershipId/reactivate',
    },
  },
} as const;

export const controlRegenerateMfaRecoveryCodesV1 = {
  operationId: 'control.regenerate-mfa-recovery-codes.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    regenerate: {
      method: 'POST',
      path: '/control/auth/mfa/recovery-codes/regenerate',
    },
  },
} as const;

export const controlReissueInvitationV1 = {
  operationId: 'control.reissue-invitation.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    reissue: {
      method: 'POST',
      path: '/control/invitations/:invitationId/reissue',
    },
  },
} as const;

export const controlRemoveMfaV1 = {
  operationId: 'control.remove-mfa.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    remove: { method: 'POST', path: '/control/auth/mfa/remove' },
  },
} as const;

export const controlRevokeAccessV1 = {
  operationId: 'control.revoke-access.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    revoke: { method: 'POST', path: '/control/grants/:grantId/revoke' },
  },
} as const;

export const controlRevokeAllIdentitySessionsV1 = {
  operationId: 'control.revoke-all-identity-sessions.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'revoke-all': {
      method: 'POST',
      path: '/control/auth/identities/:identityId/sessions/revoke-all',
    },
  },
} as const;

export const controlRevokeIdentitySessionV1 = {
  operationId: 'control.revoke-identity-session.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    revoke: {
      method: 'POST',
      path: '/control/auth/identities/:identityId/sessions/:sessionId/revoke',
    },
  },
} as const;

export const controlRevokeInvitationV1 = {
  operationId: 'control.revoke-invitation.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    revoke: {
      method: 'POST',
      path: '/control/invitations/:invitationId/revoke',
    },
  },
} as const;

export const controlRevokeMemberSessionsV1 = {
  operationId: 'control.revoke-member-sessions.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    revoke: {
      method: 'POST',
      path: '/control/team/:membershipId/sessions/revoke',
    },
  },
} as const;

export const controlSuspendMembershipV1 = {
  operationId: 'control.suspend-membership.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    suspend: { method: 'POST', path: '/control/team/:membershipId/suspend' },
  },
} as const;

export const controlUpdateCustomerV1 = {
  operationId: 'control.update-customer.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    request: { method: 'PATCH', path: '/control/customers/:userId' },
  },
} as const;

export const controlClient = {
  experienceId: 'control',
  operations: {
    'control.accept-existing-invitation-mfa.v1':
      controlAcceptExistingInvitationMfaV1,
    'control.accept-existing-invitation-password.v1':
      controlAcceptExistingInvitationPasswordV1,
    'control.accept-existing-invitation.v1': controlAcceptExistingInvitationV1,
    'control.accept-new-invitation.v1': controlAcceptNewInvitationV1,
    'control.auth-login.v1': controlAuthLoginV1,
    'control.begin-mfa-enrollment.v1': controlBeginMfaEnrollmentV1,
    'control.cli-auth-api-begin-mfa-enrollment.v1':
      controlCliAuthApiBeginMfaEnrollmentV1,
    'control.cli-auth-api-complete-mfa-challenge.v1':
      controlCliAuthApiCompleteMfaChallengeV1,
    'control.cli-auth-api-confirm-mfa-enrollment.v1':
      controlCliAuthApiConfirmMfaEnrollmentV1,
    'control.cli-auth-api-load-session.v1': controlCliAuthApiLoadSessionV1,
    'control.cli-auth-api-login.v1': controlCliAuthApiLoginV1,
    'control.cli-auth-api-logout.v1': controlCliAuthApiLogoutV1,
    'control.cli-auth-api-regenerate-mfa-recovery-codes.v1':
      controlCliAuthApiRegenerateMfaRecoveryCodesV1,
    'control.cli-auth-api-remove-mfa.v1': controlCliAuthApiRemoveMfaV1,
    'control.complete-mfa-challenge.v1': controlCompleteMfaChallengeV1,
    'control.confirm-mfa-enrollment.v1': controlConfirmMfaEnrollmentV1,
    'control.correct-order.v1': controlCorrectOrderV1,
    'control.create-customer.v1': controlCreateCustomerV1,
    'control.create-order.v1': controlCreateOrderV1,
    'control.end-membership.v1': controlEndMembershipV1,
    'control.get-customer.v1': controlGetCustomerV1,
    'control.get-member.v1': controlGetMemberV1,
    'control.get-order.v1': controlGetOrderV1,
    'control.grant-access.v1': controlGrantAccessV1,
    'control.issue-invitation.v1': controlIssueInvitationV1,
    'control.list-customers.v1': controlListCustomersV1,
    'control.list-identity-sessions.v1': controlListIdentitySessionsV1,
    'control.list-invitations.v1': controlListInvitationsV1,
    'control.list-member-sessions.v1': controlListMemberSessionsV1,
    'control.list-members.v1': controlListMembersV1,
    'control.list-orders.v1': controlListOrdersV1,
    'control.list-security-events.v1': controlListSecurityEventsV1,
    'control.load-auth-session.v1': controlLoadAuthSessionV1,
    'control.logout.v1': controlLogoutV1,
    'control.preview-invitation.v1': controlPreviewInvitationV1,
    'control.reactivate-membership.v1': controlReactivateMembershipV1,
    'control.regenerate-mfa-recovery-codes.v1':
      controlRegenerateMfaRecoveryCodesV1,
    'control.reissue-invitation.v1': controlReissueInvitationV1,
    'control.remove-mfa.v1': controlRemoveMfaV1,
    'control.revoke-access.v1': controlRevokeAccessV1,
    'control.revoke-all-identity-sessions.v1':
      controlRevokeAllIdentitySessionsV1,
    'control.revoke-identity-session.v1': controlRevokeIdentitySessionV1,
    'control.revoke-invitation.v1': controlRevokeInvitationV1,
    'control.revoke-member-sessions.v1': controlRevokeMemberSessionsV1,
    'control.suspend-membership.v1': controlSuspendMembershipV1,
    'control.update-customer.v1': controlUpdateCustomerV1,
  },
} as const;
