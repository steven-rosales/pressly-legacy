/* Handwritten browser wire descriptors. Routes are explicit protocol data. */

export const controlAcceptExistingInvitationMfaV1 = {
  operationId: 'control.accept-existing-invitation-mfa.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    mfa: {
      method: 'POST',
      path: '/control/invitations/accept/existing/mfa',
    },
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
    existing: {
      method: 'POST',
      path: '/control/invitations/accept/existing',
    },
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
    new: {
      method: 'POST',
      path: '/control/invitations/accept/new',
    },
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
    login: {
      method: 'POST',
      path: '/control/auth/login',
    },
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
    enrollment: {
      method: 'POST',
      path: '/control/auth/mfa/enrollment',
    },
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
    enrollment: {
      method: 'POST',
      path: '/control/cli/auth/mfa/enrollment',
    },
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
    challenge: {
      method: 'POST',
      path: '/control/cli/auth/mfa/challenge',
    },
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
    session: {
      method: 'GET',
      path: '/control/cli/auth/session',
    },
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
    login: {
      method: 'POST',
      path: '/control/cli/auth/login',
    },
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
    logout: {
      method: 'POST',
      path: '/control/cli/auth/logout',
    },
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
    remove: {
      method: 'POST',
      path: '/control/cli/auth/mfa/remove',
    },
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
    challenge: {
      method: 'POST',
      path: '/control/auth/mfa/challenge',
    },
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
    confirm: {
      method: 'POST',
      path: '/control/auth/mfa/enrollment/confirm',
    },
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
    request: {
      method: 'PATCH',
      path: '/control/orders/:orderId',
    },
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
    customers: {
      method: 'POST',
      path: '/control/customers',
    },
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
    orders: {
      method: 'POST',
      path: '/control/orders',
    },
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
    end: {
      method: 'POST',
      path: '/control/team/:membershipId/end',
    },
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
    request: {
      method: 'GET',
      path: '/control/customers/:userId',
    },
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
    request: {
      method: 'GET',
      path: '/control/team/:membershipId',
    },
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
    request: {
      method: 'GET',
      path: '/control/orders/:orderId',
    },
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
    grants: {
      method: 'POST',
      path: '/control/team/:membershipId/grants',
    },
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
    invitations: {
      method: 'POST',
      path: '/control/invitations',
    },
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
    customers: {
      method: 'GET',
      path: '/control/customers',
    },
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
    invitations: {
      method: 'GET',
      path: '/control/invitations',
    },
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
    sessions: {
      method: 'GET',
      path: '/control/team/:membershipId/sessions',
    },
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
    team: {
      method: 'GET',
      path: '/control/team',
    },
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
    orders: {
      method: 'GET',
      path: '/control/orders',
    },
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
    events: {
      method: 'GET',
      path: '/control/security/events',
    },
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
    session: {
      method: 'GET',
      path: '/control/auth/session',
    },
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
    logout: {
      method: 'POST',
      path: '/control/auth/logout',
    },
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
    preview: {
      method: 'POST',
      path: '/control/invitations/preview',
    },
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
    remove: {
      method: 'POST',
      path: '/control/auth/mfa/remove',
    },
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
    revoke: {
      method: 'POST',
      path: '/control/grants/:grantId/revoke',
    },
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
    suspend: {
      method: 'POST',
      path: '/control/team/:membershipId/suspend',
    },
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
    request: {
      method: 'PATCH',
      path: '/control/customers/:userId',
    },
  },
} as const;
export const controlBrowserOperations = Object.freeze({
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
  'control.revoke-all-identity-sessions.v1': controlRevokeAllIdentitySessionsV1,
  'control.revoke-identity-session.v1': controlRevokeIdentitySessionV1,
  'control.revoke-invitation.v1': controlRevokeInvitationV1,
  'control.revoke-member-sessions.v1': controlRevokeMemberSessionsV1,
  'control.suspend-membership.v1': controlSuspendMembershipV1,
  'control.update-customer.v1': controlUpdateCustomerV1,
});
export const customerAuthLoginV1 = {
  operationId: 'customer.auth-login.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    login: {
      method: 'POST',
      path: '/auth/login',
    },
  },
} as const;
export const customerBeginMfaEnrollmentV1 = {
  operationId: 'customer.begin-mfa-enrollment.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    enrollment: {
      method: 'POST',
      path: '/auth/mfa/enrollment',
    },
  },
} as const;
export const customerCompleteMfaChallengeV1 = {
  operationId: 'customer.complete-mfa-challenge.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    challenge: {
      method: 'POST',
      path: '/auth/mfa/challenge',
    },
  },
} as const;
export const customerConfirmMfaEnrollmentV1 = {
  operationId: 'customer.confirm-mfa-enrollment.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    confirm: {
      method: 'POST',
      path: '/auth/mfa/enrollment/confirm',
    },
  },
} as const;
export const customerListIdentitySessionsV1 = {
  operationId: 'customer.list-identity-sessions.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    sessions: {
      method: 'GET',
      path: '/auth/identities/:identityId/sessions',
    },
  },
} as const;
export const customerLoadAuthSessionV1 = {
  operationId: 'customer.load-auth-session.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    session: {
      method: 'GET',
      path: '/auth/session',
    },
  },
} as const;
export const customerLogoutV1 = {
  operationId: 'customer.logout.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    logout: {
      method: 'POST',
      path: '/auth/logout',
    },
  },
} as const;
export const customerRegenerateMfaRecoveryCodesV1 = {
  operationId: 'customer.regenerate-mfa-recovery-codes.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    regenerate: {
      method: 'POST',
      path: '/auth/mfa/recovery-codes/regenerate',
    },
  },
} as const;
export const customerRemoveMfaV1 = {
  operationId: 'customer.remove-mfa.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    remove: {
      method: 'POST',
      path: '/auth/mfa/remove',
    },
  },
} as const;
export const customerRevokeAllIdentitySessionsV1 = {
  operationId: 'customer.revoke-all-identity-sessions.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'revoke-all': {
      method: 'POST',
      path: '/auth/identities/:identityId/sessions/revoke-all',
    },
  },
} as const;
export const customerRevokeIdentitySessionV1 = {
  operationId: 'customer.revoke-identity-session.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    revoke: {
      method: 'POST',
      path: '/auth/identities/:identityId/sessions/:sessionId/revoke',
    },
  },
} as const;
export const pricingLoadPricingCatalogV1 = {
  operationId: 'pricing.load-pricing-catalog.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    pricing: {
      method: 'GET',
      path: '/pricing/services/:serviceSlug/pricing',
    },
  },
} as const;
export const customerBrowserOperations = Object.freeze({
  'customer.auth-login.v1': customerAuthLoginV1,
  'customer.begin-mfa-enrollment.v1': customerBeginMfaEnrollmentV1,
  'customer.complete-mfa-challenge.v1': customerCompleteMfaChallengeV1,
  'customer.confirm-mfa-enrollment.v1': customerConfirmMfaEnrollmentV1,
  'customer.list-identity-sessions.v1': customerListIdentitySessionsV1,
  'customer.load-auth-session.v1': customerLoadAuthSessionV1,
  'customer.logout.v1': customerLogoutV1,
  'customer.regenerate-mfa-recovery-codes.v1':
    customerRegenerateMfaRecoveryCodesV1,
  'customer.remove-mfa.v1': customerRemoveMfaV1,
  'customer.revoke-all-identity-sessions.v1':
    customerRevokeAllIdentitySessionsV1,
  'customer.revoke-identity-session.v1': customerRevokeIdentitySessionV1,
  'pricing.load-pricing-catalog.v1': pricingLoadPricingCatalogV1,
});
export const ordersAcceptIncomingOrderProposalV1 = {
  operationId: 'orders.accept-incoming-order-proposal.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    accept: {
      method: 'POST',
      path: '/order-management/locations/:locationId/incoming-orders/:proposalId/accept',
    },
  },
} as const;
export const ordersListIncomingOrderProposalsV1 = {
  operationId: 'orders.list-incoming-order-proposals.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'incoming-orders': {
      method: 'GET',
      path: '/order-management/locations/:locationId/incoming-orders',
    },
  },
} as const;
export const ordersRejectIncomingOrderProposalV1 = {
  operationId: 'orders.reject-incoming-order-proposal.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    reject: {
      method: 'POST',
      path: '/order-management/locations/:locationId/incoming-orders/:proposalId/reject',
    },
  },
} as const;
export const ordersRestoreIncomingOrderProposalV1 = {
  operationId: 'orders.restore-incoming-order-proposal.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    restore: {
      method: 'POST',
      path: '/order-management/locations/:locationId/incoming-orders/:proposalId/restore',
    },
  },
} as const;
export const processorAuthLoginV1 = {
  operationId: 'processor.auth-login.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    login: {
      method: 'POST',
      path: '/processor/auth/login',
    },
  },
} as const;
export const processorCompleteMfaChallengeV1 = {
  operationId: 'processor.complete-mfa-challenge.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    challenge: {
      method: 'POST',
      path: '/processor/auth/mfa/challenge',
    },
  },
} as const;
export const processorListProductionHistoryActivityV1 = {
  operationId: 'processor.list-production-history-activity.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    activity: {
      method: 'GET',
      path: '/production/locations/:locationId/history/activity',
    },
  },
} as const;
export const processorListProductionOrderControlV1 = {
  operationId: 'processor.list-production-order-control.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'order-control': {
      method: 'GET',
      path: '/production/locations/:locationId/order-control',
    },
  },
} as const;
export const processorLoadAuthSessionV1 = {
  operationId: 'processor.load-auth-session.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    session: {
      method: 'GET',
      path: '/processor/auth/session',
    },
  },
} as const;
export const processorLoadProductionBoardV1 = {
  operationId: 'processor.load-production-board.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    board: {
      method: 'GET',
      path: '/production/locations/:locationId/runs/:productionRunId/board',
    },
  },
} as const;
export const processorLoadProductionHistoryRunV1 = {
  operationId: 'processor.load-production-history-run.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    request: {
      method: 'GET',
      path: '/production/locations/:locationId/history/runs/:productionRunId',
    },
  },
} as const;
export const processorLoadProductionWorkspaceV1 = {
  operationId: 'processor.load-production-workspace.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    workspace: {
      method: 'GET',
      path: '/production/locations/:locationId/workspace',
    },
  },
} as const;
export const processorLoadRemainingDayForecastV1 = {
  operationId: 'processor.load-remaining-day-forecast.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    forecast: {
      method: 'GET',
      path: '/production/locations/:locationId/forecast',
    },
  },
} as const;
export const processorLogoutV1 = {
  operationId: 'processor.logout.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    logout: {
      method: 'POST',
      path: '/processor/auth/logout',
    },
  },
} as const;
export const processorPreviewProductionOrderBacklogV1 = {
  operationId: 'processor.preview-production-order-backlog.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    preview: {
      method: 'POST',
      path: '/production/locations/:locationId/order-backlog/preview',
    },
  },
} as const;
export const productionAcceptScheduleV1 = {
  operationId: 'production.accept-schedule.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    accept: {
      method: 'POST',
      path: '/production/locations/:locationId/schedules/:scheduleRunId/accept',
    },
  },
} as const;
export const productionAdvanceStageV1 = {
  operationId: 'production.advance-stage.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    complete: {
      method: 'POST',
      path: '/production/locations/:locationId/stages/:stageRunId/complete',
    },
    start: {
      method: 'POST',
      path: '/production/locations/:locationId/stages/:stageRunId/start',
    },
  },
} as const;
export const productionAssignStageMachinesV1 = {
  operationId: 'production.assign-stage-machines.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    machines: {
      method: 'PUT',
      path: '/production/locations/:locationId/stages/:stageRunId/machines',
    },
  },
} as const;
export const productionChangeAdmissionV1 = {
  operationId: 'production.change-admission.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    admission: {
      method: 'PUT',
      path: '/production/locations/:locationId/orders/:productionOrderId/admission',
    },
  },
} as const;
export const productionChangeOrderResolutionV1 = {
  operationId: 'production.change-order-resolution.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    resolution: {
      method: 'PUT',
      path: '/production/locations/:locationId/orders/:productionOrderId/resolution',
    },
  },
} as const;
export const productionCommitOrderBacklogV1 = {
  operationId: 'production.commit-order-backlog.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'order-backlog': {
      method: 'POST',
      path: '/production/locations/:locationId/order-backlog',
    },
  },
} as const;
export const productionCommitOrderRouteV1 = {
  operationId: 'production.commit-order-route.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    route: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route',
    },
  },
} as const;
export const productionConfirmOrderOvertimeV1 = {
  operationId: 'production.confirm-order-overtime.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'confirm-overtime': {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime',
    },
  },
} as const;
export const productionCreateScheduleV1 = {
  operationId: 'production.create-schedule.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    schedules: {
      method: 'POST',
      path: '/production/locations/:locationId/schedules',
    },
  },
} as const;
export const productionCreateShiftV1 = {
  operationId: 'production.create-shift.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    shifts: {
      method: 'POST',
      path: '/production/locations/:locationId/shifts',
    },
  },
} as const;
export const productionFreezeBatchMembershipV1 = {
  operationId: 'production.freeze-batch-membership.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    freeze: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/freeze',
    },
  },
} as const;
export const productionListHistoryPlansV1 = {
  operationId: 'production.list-history-plans.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    plans: {
      method: 'GET',
      path: '/production/locations/:locationId/history/plans',
    },
  },
} as const;
export const productionListHistoryRunsV1 = {
  operationId: 'production.list-history-runs.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    runs: {
      method: 'GET',
      path: '/production/locations/:locationId/history/runs',
    },
  },
} as const;
export const productionListLocationsV1 = {
  operationId: 'production.list-locations.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    locations: {
      method: 'GET',
      path: '/production/locations',
    },
  },
} as const;
export const productionListOrdersV1 = {
  operationId: 'production.list-orders.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    orders: {
      method: 'GET',
      path: '/production/locations/:locationId/orders',
    },
  },
} as const;
export const productionLoadScheduleV1 = {
  operationId: 'production.load-schedule.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    request: {
      method: 'GET',
      path: '/production/locations/:locationId/schedules/:scheduleRunId',
    },
  },
} as const;
export const productionPlaceOrderAutomaticallyV1 = {
  operationId: 'production.place-order-automatically.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    place: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/place',
    },
  },
} as const;
export const productionPlaceOrderExactlyV1 = {
  operationId: 'production.place-order-exactly.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    place: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/orders/:productionOrderId/place',
    },
  },
} as const;
export const productionPreviewOrderRouteV1 = {
  operationId: 'production.preview-order-route.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    preview: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route/preview',
    },
  },
} as const;
export const productionPublishSchedulerConfigV1 = {
  operationId: 'production.publish-scheduler-config.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'scheduler-configs': {
      method: 'POST',
      path: '/production/locations/:locationId/scheduler-configs',
    },
  },
} as const;
export const productionReconcileBatchProgressV1 = {
  operationId: 'production.reconcile-batch-progress.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    'progress-reconciliation': {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/progress-reconciliation',
    },
  },
} as const;
export const productionRecordOrderIntakeV1 = {
  operationId: 'production.record-order-intake.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    intake: {
      method: 'PUT',
      path: '/production/locations/:locationId/orders/:productionOrderId/intake',
    },
  },
} as const;
export const productionReplaceShiftSelectionV1 = {
  operationId: 'production.replace-shift-selection.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    selection: {
      method: 'PUT',
      path: '/production/locations/:locationId/shifts/:productionShiftId/selection',
    },
  },
} as const;
export const productionSetOrderPriorityV1 = {
  operationId: 'production.set-order-priority.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    priority: {
      method: 'PATCH',
      path: '/production/locations/:locationId/orders/:productionOrderId/priority',
    },
  },
} as const;
export const productionStartScheduleV1 = {
  operationId: 'production.start-schedule.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    start: {
      method: 'POST',
      path: '/production/locations/:locationId/schedules/:scheduleRunId/start',
    },
  },
} as const;
export const productionSubscribeChangesV1 = {
  operationId: 'production.subscribe-changes.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
    eventVersion: 1,
  },
  eventStream: {
    method: 'GET',
    path: '/production/locations/:locationId/events',
    retryMs: 3000,
    eventTypes: ['ready', 'change', 'resync'],
  },
  http: {},
} as const;
export const productionUnfreezeBatchMembershipV1 = {
  operationId: 'production.unfreeze-batch-membership.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    unfreeze: {
      method: 'POST',
      path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/unfreeze',
    },
  },
} as const;
export const productionUpdateShiftV1 = {
  operationId: 'production.update-shift.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    request: {
      method: 'PATCH',
      path: '/production/locations/:locationId/shifts/:productionShiftId',
    },
  },
} as const;
export const processorBrowserOperations = Object.freeze({
  'orders.accept-incoming-order-proposal.v1':
    ordersAcceptIncomingOrderProposalV1,
  'orders.list-incoming-order-proposals.v1': ordersListIncomingOrderProposalsV1,
  'orders.reject-incoming-order-proposal.v1':
    ordersRejectIncomingOrderProposalV1,
  'orders.restore-incoming-order-proposal.v1':
    ordersRestoreIncomingOrderProposalV1,
  'processor.auth-login.v1': processorAuthLoginV1,
  'processor.complete-mfa-challenge.v1': processorCompleteMfaChallengeV1,
  'processor.list-production-history-activity.v1':
    processorListProductionHistoryActivityV1,
  'processor.list-production-order-control.v1':
    processorListProductionOrderControlV1,
  'processor.load-auth-session.v1': processorLoadAuthSessionV1,
  'processor.load-production-board.v1': processorLoadProductionBoardV1,
  'processor.load-production-history-run.v1':
    processorLoadProductionHistoryRunV1,
  'processor.load-production-workspace.v1': processorLoadProductionWorkspaceV1,
  'processor.load-remaining-day-forecast.v1':
    processorLoadRemainingDayForecastV1,
  'processor.logout.v1': processorLogoutV1,
  'processor.preview-production-order-backlog.v1':
    processorPreviewProductionOrderBacklogV1,
  'production.accept-schedule.v1': productionAcceptScheduleV1,
  'production.advance-stage.v1': productionAdvanceStageV1,
  'production.assign-stage-machines.v1': productionAssignStageMachinesV1,
  'production.change-admission.v1': productionChangeAdmissionV1,
  'production.change-order-resolution.v1': productionChangeOrderResolutionV1,
  'production.commit-order-backlog.v1': productionCommitOrderBacklogV1,
  'production.commit-order-route.v1': productionCommitOrderRouteV1,
  'production.confirm-order-overtime.v1': productionConfirmOrderOvertimeV1,
  'production.create-schedule.v1': productionCreateScheduleV1,
  'production.create-shift.v1': productionCreateShiftV1,
  'production.freeze-batch-membership.v1': productionFreezeBatchMembershipV1,
  'production.list-history-plans.v1': productionListHistoryPlansV1,
  'production.list-history-runs.v1': productionListHistoryRunsV1,
  'production.list-locations.v1': productionListLocationsV1,
  'production.list-orders.v1': productionListOrdersV1,
  'production.load-schedule.v1': productionLoadScheduleV1,
  'production.place-order-automatically.v1':
    productionPlaceOrderAutomaticallyV1,
  'production.place-order-exactly.v1': productionPlaceOrderExactlyV1,
  'production.preview-order-route.v1': productionPreviewOrderRouteV1,
  'production.publish-scheduler-config.v1': productionPublishSchedulerConfigV1,
  'production.reconcile-batch-progress.v1': productionReconcileBatchProgressV1,
  'production.record-order-intake.v1': productionRecordOrderIntakeV1,
  'production.replace-shift-selection.v1': productionReplaceShiftSelectionV1,
  'production.set-order-priority.v1': productionSetOrderPriorityV1,
  'production.start-schedule.v1': productionStartScheduleV1,
  'production.subscribe-changes.v1': productionSubscribeChangesV1,
  'production.unfreeze-batch-membership.v1':
    productionUnfreezeBatchMembershipV1,
  'production.update-shift.v1': productionUpdateShiftV1,
});
