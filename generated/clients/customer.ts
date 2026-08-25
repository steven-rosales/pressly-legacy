/* This file is generated from the checked deployment topology. */
export const customerAuthLoginV1 = {
  operationId: 'customer.auth-login.v1',
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
  },
  http: {
    login: { method: 'POST', path: '/auth/login' },
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
    enrollment: { method: 'POST', path: '/auth/mfa/enrollment' },
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
    challenge: { method: 'POST', path: '/auth/mfa/challenge' },
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
    confirm: { method: 'POST', path: '/auth/mfa/enrollment/confirm' },
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
    sessions: { method: 'GET', path: '/auth/identities/:identityId/sessions' },
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
    session: { method: 'GET', path: '/auth/session' },
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
    logout: { method: 'POST', path: '/auth/logout' },
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
    regenerate: { method: 'POST', path: '/auth/mfa/recovery-codes/regenerate' },
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
    remove: { method: 'POST', path: '/auth/mfa/remove' },
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
    pricing: { method: 'GET', path: '/pricing/services/:serviceSlug/pricing' },
  },
} as const;

export const customerClient = {
  experienceId: 'customer',
  operations: {
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
  },
} as const;
