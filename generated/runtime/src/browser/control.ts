/* This file is generated from the checked deployment topology. */
import {
  createControlBrowserExperience,
  type ControlBrowserCapabilities,
  type ControlBrowserHttpClient,
} from '@pressly/experience-control/browser';
import { controlClient } from '@pressly/generated/clients/control';
import {
  makeControlBrowserClients,
  type ControlBrowserOperationBindings,
} from '@pressly/topology/runtime/browser';

const operations = controlClient.operations;

export const controlBrowserOperationBindings = Object.freeze({
  authentication: Object.freeze({
    login: operations['control.auth-login.v1'],
    completeMfaChallenge: operations['control.complete-mfa-challenge.v1'],
    loadSession: operations['control.load-auth-session.v1'],
    logout: operations['control.logout.v1'],
    listIdentitySessions: operations['control.list-identity-sessions.v1'],
    revokeAllIdentitySessions:
      operations['control.revoke-all-identity-sessions.v1'],
    revokeIdentitySession: operations['control.revoke-identity-session.v1'],
    beginMfaEnrollment: operations['control.begin-mfa-enrollment.v1'],
    confirmMfaEnrollment: operations['control.confirm-mfa-enrollment.v1'],
    regenerateMfaRecoveryCodes:
      operations['control.regenerate-mfa-recovery-codes.v1'],
    removeMfa: operations['control.remove-mfa.v1'],
  }),
  security: Object.freeze({
    listSecurityEvents: operations['control.list-security-events.v1'],
  }),
  workforce: Object.freeze({
    listMembers: operations['control.list-members.v1'],
    getMember: operations['control.get-member.v1'],
    listMemberSessions: operations['control.list-member-sessions.v1'],
    revokeMemberSessions: operations['control.revoke-member-sessions.v1'],
    listInvitations: operations['control.list-invitations.v1'],
    issueInvitation: operations['control.issue-invitation.v1'],
    reissueInvitation: operations['control.reissue-invitation.v1'],
    revokeInvitation: operations['control.revoke-invitation.v1'],
    suspendMembership: operations['control.suspend-membership.v1'],
    reactivateMembership: operations['control.reactivate-membership.v1'],
    endMembership: operations['control.end-membership.v1'],
    grantAccess: operations['control.grant-access.v1'],
    revokeAccess: operations['control.revoke-access.v1'],
  }),
  invitations: Object.freeze({
    previewInvitation: operations['control.preview-invitation.v1'],
    acceptNewInvitation: operations['control.accept-new-invitation.v1'],
    acceptExistingInvitation:
      operations['control.accept-existing-invitation.v1'],
    acceptExistingInvitationPassword:
      operations['control.accept-existing-invitation-password.v1'],
    acceptExistingInvitationMfa:
      operations['control.accept-existing-invitation-mfa.v1'],
  }),
  customers: Object.freeze({
    listCustomers: operations['control.list-customers.v1'],
    getCustomer: operations['control.get-customer.v1'],
    createCustomer: operations['control.create-customer.v1'],
    updateCustomer: operations['control.update-customer.v1'],
  }),
  orders: Object.freeze({
    listOrders: operations['control.list-orders.v1'],
    getOrder: operations['control.get-order.v1'],
    createOrder: operations['control.create-order.v1'],
    correctOrder: operations['control.correct-order.v1'],
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

export type {
  ControlBrowserCapabilities,
  ControlBrowserHttpClient,
  ControlRequestErrorKind,
} from '@pressly/experience-control/browser';
export { makeControlRequestError } from '@pressly/experience-control/browser';
export { makeControlBrowserClients } from '@pressly/topology/runtime/browser';
