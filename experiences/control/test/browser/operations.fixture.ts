import type {
  BrowserHttpMethod,
  BrowserHttpSurface,
  ControlAuthenticationOperations,
  ControlCustomerOperations,
  ControlInvitationOperations,
  ControlOrderOperations,
  ControlSecurityOperations,
  ControlWorkforceOperations,
  GeneratedBrowserOperation,
} from "../../src/browser.ts"

const contract = Object.freeze({
  inputVersion: 1,
  outputVersion: 1,
  failureVersion: 1,
})

const operation = <
  const Id extends string,
  const Key extends string,
  const Method extends BrowserHttpMethod,
>(
  operationId: Id,
  key: Key,
  method: Method,
  path: string,
): GeneratedBrowserOperation<
  Id,
  Readonly<Record<Key, BrowserHttpSurface<Method>>>
> =>
  ({
    operationId,
    contract,
    http: { [key]: { method, path } },
  }) as GeneratedBrowserOperation<
    Id,
    Readonly<Record<Key, BrowserHttpSurface<Method>>>
  >

export const controlAuthenticationOperations = {
  login: operation(
    "control.auth-login.v1",
    "login",
    "POST",
    "/control/auth/login",
  ),
  completeMfaChallenge: operation(
    "control.complete-mfa-challenge.v1",
    "challenge",
    "POST",
    "/control/auth/mfa/challenge",
  ),
  loadSession: operation(
    "control.load-auth-session.v1",
    "session",
    "GET",
    "/control/auth/session",
  ),
  logout: operation(
    "control.logout.v1",
    "logout",
    "POST",
    "/control/auth/logout",
  ),
  listIdentitySessions: operation(
    "control.list-identity-sessions.v1",
    "sessions",
    "GET",
    "/control/auth/identities/:identityId/sessions",
  ),
  revokeAllIdentitySessions: operation(
    "control.revoke-all-identity-sessions.v1",
    "revoke-all",
    "POST",
    "/control/auth/identities/:identityId/sessions/revoke-all",
  ),
  revokeIdentitySession: operation(
    "control.revoke-identity-session.v1",
    "revoke",
    "POST",
    "/control/auth/identities/:identityId/sessions/:sessionId/revoke",
  ),
  beginMfaEnrollment: operation(
    "control.begin-mfa-enrollment.v1",
    "enrollment",
    "POST",
    "/control/auth/mfa/enrollment",
  ),
  confirmMfaEnrollment: operation(
    "control.confirm-mfa-enrollment.v1",
    "confirm",
    "POST",
    "/control/auth/mfa/enrollment/confirm",
  ),
  regenerateMfaRecoveryCodes: operation(
    "control.regenerate-mfa-recovery-codes.v1",
    "regenerate",
    "POST",
    "/control/auth/mfa/recovery-codes/regenerate",
  ),
  removeMfa: operation(
    "control.remove-mfa.v1",
    "remove",
    "POST",
    "/control/auth/mfa/remove",
  ),
} satisfies ControlAuthenticationOperations

export const controlWorkforceOperations = {
  listMembers: operation(
    "control.list-members.v1",
    "team",
    "GET",
    "/control/team",
  ),
  getMember: operation(
    "control.get-member.v1",
    "request",
    "GET",
    "/control/team/:membershipId",
  ),
  listMemberSessions: operation(
    "control.list-member-sessions.v1",
    "sessions",
    "GET",
    "/control/team/:membershipId/sessions",
  ),
  revokeMemberSessions: operation(
    "control.revoke-member-sessions.v1",
    "revoke",
    "POST",
    "/control/team/:membershipId/sessions/revoke",
  ),
  listInvitations: operation(
    "control.list-invitations.v1",
    "invitations",
    "GET",
    "/control/invitations",
  ),
  issueInvitation: operation(
    "control.issue-invitation.v1",
    "invitations",
    "POST",
    "/control/invitations",
  ),
  reissueInvitation: operation(
    "control.reissue-invitation.v1",
    "reissue",
    "POST",
    "/control/invitations/:invitationId/reissue",
  ),
  revokeInvitation: operation(
    "control.revoke-invitation.v1",
    "revoke",
    "POST",
    "/control/invitations/:invitationId/revoke",
  ),
  suspendMembership: operation(
    "control.suspend-membership.v1",
    "suspend",
    "POST",
    "/control/team/:membershipId/suspend",
  ),
  reactivateMembership: operation(
    "control.reactivate-membership.v1",
    "reactivate",
    "POST",
    "/control/team/:membershipId/reactivate",
  ),
  endMembership: operation(
    "control.end-membership.v1",
    "end",
    "POST",
    "/control/team/:membershipId/end",
  ),
  grantAccess: operation(
    "control.grant-access.v1",
    "grants",
    "POST",
    "/control/team/:membershipId/grants",
  ),
  revokeAccess: operation(
    "control.revoke-access.v1",
    "revoke",
    "POST",
    "/control/grants/:grantId/revoke",
  ),
} satisfies ControlWorkforceOperations

export const controlInvitationOperations = {
  previewInvitation: operation(
    "control.preview-invitation.v1",
    "preview",
    "POST",
    "/control/invitations/preview",
  ),
  acceptNewInvitation: operation(
    "control.accept-new-invitation.v1",
    "new",
    "POST",
    "/control/invitations/accept/new",
  ),
  acceptExistingInvitation: operation(
    "control.accept-existing-invitation.v1",
    "existing",
    "POST",
    "/control/invitations/accept/existing",
  ),
  acceptExistingInvitationPassword: operation(
    "control.accept-existing-invitation-password.v1",
    "password",
    "POST",
    "/control/invitations/accept/existing/password",
  ),
  acceptExistingInvitationMfa: operation(
    "control.accept-existing-invitation-mfa.v1",
    "mfa",
    "POST",
    "/control/invitations/accept/existing/mfa",
  ),
} satisfies ControlInvitationOperations

export const controlCustomerOperations = {
  listCustomers: operation(
    "control.list-customers.v1",
    "customers",
    "GET",
    "/control/customers",
  ),
  getCustomer: operation(
    "control.get-customer.v1",
    "request",
    "GET",
    "/control/customers/:userId",
  ),
  createCustomer: operation(
    "control.create-customer.v1",
    "customers",
    "POST",
    "/control/customers",
  ),
  updateCustomer: operation(
    "control.update-customer.v1",
    "request",
    "PATCH",
    "/control/customers/:userId",
  ),
} satisfies ControlCustomerOperations

export const controlOrderOperations = {
  listOrders: operation(
    "control.list-orders.v1",
    "orders",
    "GET",
    "/control/orders",
  ),
  getOrder: operation(
    "control.get-order.v1",
    "request",
    "GET",
    "/control/orders/:orderId",
  ),
  createOrder: operation(
    "control.create-order.v1",
    "orders",
    "POST",
    "/control/orders",
  ),
  correctOrder: operation(
    "control.correct-order.v1",
    "request",
    "PATCH",
    "/control/orders/:orderId",
  ),
} satisfies ControlOrderOperations

export const controlSecurityOperations = {
  listSecurityEvents: operation(
    "control.list-security-events.v1",
    "events",
    "GET",
    "/control/security/events",
  ),
} satisfies ControlSecurityOperations

export const allControlBrowserOperations = Object.freeze([
  ...Object.values(controlAuthenticationOperations),
  ...Object.values(controlWorkforceOperations),
  ...Object.values(controlInvitationOperations),
  ...Object.values(controlCustomerOperations),
  ...Object.values(controlOrderOperations),
  ...Object.values(controlSecurityOperations),
])
