import {
  createControlBrowserExperience,
  type ControlBrowserCapabilities,
  type ControlBrowserHttpClient,
} from '@pressly/experience-control/browser';
import { controlBrowserOperations } from '../browser-operations.js';
import {
  makeControlBrowserClients,
  type ControlBrowserOperationBindings,
} from '../runtime/browser/public.js';

export const controlBrowserOperationBindings = Object.freeze({
  authentication: Object.freeze({
    login: controlBrowserOperations['control.auth-login.v1'],
    completeMfaChallenge:
      controlBrowserOperations['control.complete-mfa-challenge.v1'],
    loadSession: controlBrowserOperations['control.load-auth-session.v1'],
    logout: controlBrowserOperations['control.logout.v1'],
    listIdentitySessions:
      controlBrowserOperations['control.list-identity-sessions.v1'],
    revokeAllIdentitySessions:
      controlBrowserOperations['control.revoke-all-identity-sessions.v1'],
    revokeIdentitySession:
      controlBrowserOperations['control.revoke-identity-session.v1'],
    beginMfaEnrollment:
      controlBrowserOperations['control.begin-mfa-enrollment.v1'],
    confirmMfaEnrollment:
      controlBrowserOperations['control.confirm-mfa-enrollment.v1'],
    regenerateMfaRecoveryCodes:
      controlBrowserOperations['control.regenerate-mfa-recovery-codes.v1'],
    removeMfa: controlBrowserOperations['control.remove-mfa.v1'],
  }),
  security: Object.freeze({
    listSecurityEvents:
      controlBrowserOperations['control.list-security-events.v1'],
  }),
  workforce: Object.freeze({
    listMembers: controlBrowserOperations['control.list-members.v1'],
    getMember: controlBrowserOperations['control.get-member.v1'],
    listMemberSessions:
      controlBrowserOperations['control.list-member-sessions.v1'],
    revokeMemberSessions:
      controlBrowserOperations['control.revoke-member-sessions.v1'],
    listInvitations: controlBrowserOperations['control.list-invitations.v1'],
    issueInvitation: controlBrowserOperations['control.issue-invitation.v1'],
    reissueInvitation:
      controlBrowserOperations['control.reissue-invitation.v1'],
    revokeInvitation: controlBrowserOperations['control.revoke-invitation.v1'],
    suspendMembership:
      controlBrowserOperations['control.suspend-membership.v1'],
    reactivateMembership:
      controlBrowserOperations['control.reactivate-membership.v1'],
    endMembership: controlBrowserOperations['control.end-membership.v1'],
    grantAccess: controlBrowserOperations['control.grant-access.v1'],
    revokeAccess: controlBrowserOperations['control.revoke-access.v1'],
  }),
  invitations: Object.freeze({
    previewInvitation:
      controlBrowserOperations['control.preview-invitation.v1'],
    acceptNewInvitation:
      controlBrowserOperations['control.accept-new-invitation.v1'],
    acceptExistingInvitation:
      controlBrowserOperations['control.accept-existing-invitation.v1'],
    acceptExistingInvitationPassword:
      controlBrowserOperations[
        'control.accept-existing-invitation-password.v1'
      ],
    acceptExistingInvitationMfa:
      controlBrowserOperations['control.accept-existing-invitation-mfa.v1'],
  }),
  customers: Object.freeze({
    listCustomers: controlBrowserOperations['control.list-customers.v1'],
    getCustomer: controlBrowserOperations['control.get-customer.v1'],
    createCustomer: controlBrowserOperations['control.create-customer.v1'],
    updateCustomer: controlBrowserOperations['control.update-customer.v1'],
  }),
  orders: Object.freeze({
    listOrders: controlBrowserOperations['control.list-orders.v1'],
    getOrder: controlBrowserOperations['control.get-order.v1'],
    createOrder: controlBrowserOperations['control.create-order.v1'],
    correctOrder: controlBrowserOperations['control.correct-order.v1'],
  }),
}) satisfies ControlBrowserOperationBindings;

export type CreateControlBrowserApplicationInput = Readonly<{
  browser: ControlBrowserCapabilities;
  client: ControlBrowserHttpClient;
  idempotencyKey: () => string;
  reportUnexpectedError: (
    error: Error,
    context: Readonly<{ componentStack: string }>,
  ) => void;
}>;

export const createControlBrowserApplication = (
  input: CreateControlBrowserApplicationInput,
) =>
  createControlBrowserExperience({
    browser: input.browser,
    clients: makeControlBrowserClients({
      client: input.client,
      idempotencyKey: input.idempotencyKey,
      operations: controlBrowserOperationBindings,
    }),
    reportUnexpectedError: input.reportUnexpectedError,
  });
