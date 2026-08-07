import type { Database } from '@pressly/db/client';
import type { Clock } from '@pressly/time';
import type { AcceptControlInvitationPort } from '../features/invitations/accept-control-invitation/accept-control-invitation.port.ts';
import { makeAcceptControlInvitation } from '../features/invitations/accept-control-invitation/accept-control-invitation.usecase.ts';
import type { IssueControlInvitationPort } from '../features/invitations/issue-control-invitation/issue-control-invitation.port.ts';
import { makeIssueControlInvitation } from '../features/invitations/issue-control-invitation/issue-control-invitation.usecase.ts';
import type { ListControlInvitationsPort } from '../features/invitations/list-control-invitations/list-control-invitations.port.ts';
import { makeListControlInvitations } from '../features/invitations/list-control-invitations/list-control-invitations.usecase.ts';
import type { PreviewControlInvitationPort } from '../features/invitations/preview-control-invitation/preview-control-invitation.port.ts';
import { makePreviewControlInvitation } from '../features/invitations/preview-control-invitation/preview-control-invitation.usecase.ts';
import type { ReissueControlInvitationPort } from '../features/invitations/reissue-control-invitation/reissue-control-invitation.port.ts';
import { makeReissueControlInvitation } from '../features/invitations/reissue-control-invitation/reissue-control-invitation.usecase.ts';
import type { RevokeControlInvitationPort } from '../features/invitations/revoke-control-invitation/revoke-control-invitation.port.ts';
import { makeRevokeControlInvitation } from '../features/invitations/revoke-control-invitation/revoke-control-invitation.usecase.ts';
import type { CreateControlCustomerPort } from '../features/customers/create-control-customer/create-control-customer.port.ts';
import { makeCreateControlCustomer } from '../features/customers/create-control-customer/create-control-customer.usecase.ts';
import type { GetControlCustomerPort } from '../features/customers/get-control-customer/get-control-customer.port.ts';
import { makeGetControlCustomer } from '../features/customers/get-control-customer/get-control-customer.usecase.ts';
import type { ListControlCustomersPort } from '../features/customers/list-control-customers/list-control-customers.port.ts';
import { makeListControlCustomers } from '../features/customers/list-control-customers/list-control-customers.usecase.ts';
import type { UpdateControlCustomerPort } from '../features/customers/update-control-customer/update-control-customer.port.ts';
import { makeUpdateControlCustomer } from '../features/customers/update-control-customer/update-control-customer.usecase.ts';
import type { CorrectControlOrderPort } from '../features/orders/correct-control-order/correct-control-order.port.ts';
import { makeCorrectControlOrder } from '../features/orders/correct-control-order/correct-control-order.usecase.ts';
import type { CreateControlOrderPort } from '../features/orders/create-control-order/create-control-order.port.ts';
import { makeCreateControlOrder } from '../features/orders/create-control-order/create-control-order.usecase.ts';
import { makeGetControlOrder } from '../features/orders/get-control-order/get-control-order.usecase.ts';
import type { ListControlOrdersPort } from '../features/orders/list-control-orders/list-control-orders.port.ts';
import { makeListControlOrders } from '../features/orders/list-control-orders/list-control-orders.usecase.ts';
import type { ReadControlSecurityEventsPort } from '../features/security/read-control-security-events/read-control-security-events.port.ts';
import { makeReadControlSecurityEvents } from '../features/security/read-control-security-events/read-control-security-events.usecase.ts';
import { makeResolveControlAccess } from '../features/session/resolve-control-access/resolve-control-access.usecase.ts';
import { makePostgresResolveControlAccessRepository } from '../features/session/resolve-control-access/resolve-control-access.repo.ts';
import type { GetControlMemberPort } from '../features/workforce/get-control-member/get-control-member.port.ts';
import { makeGetControlMember } from '../features/workforce/get-control-member/get-control-member.usecase.ts';
import type { GrantControlAccessPort } from '../features/workforce/grant-control-access/grant-control-access.port.ts';
import { makeGrantControlAccess } from '../features/workforce/grant-control-access/grant-control-access.usecase.ts';
import type { ListControlMemberSessionsPort } from '../features/workforce/list-control-member-sessions/list-control-member-sessions.port.ts';
import { makeListControlMemberSessions } from '../features/workforce/list-control-member-sessions/list-control-member-sessions.usecase.ts';
import type { ListControlMembersPort } from '../features/workforce/list-control-members/list-control-members.port.ts';
import { makeListControlMembers } from '../features/workforce/list-control-members/list-control-members.usecase.ts';
import type { RevokeControlAccessPort } from '../features/workforce/revoke-control-access/revoke-control-access.port.ts';
import { makeRevokeControlAccess } from '../features/workforce/revoke-control-access/revoke-control-access.usecase.ts';
import type { RevokeControlMemberSessionsPort } from '../features/workforce/revoke-control-member-sessions/revoke-control-member-sessions.port.ts';
import { makeRevokeControlMemberSessions } from '../features/workforce/revoke-control-member-sessions/revoke-control-member-sessions.usecase.ts';
import type { TransitionControlMembershipPort } from '../features/workforce/transition-control-membership/transition-control-membership.port.ts';
import { makeTransitionControlMembership } from '../features/workforce/transition-control-membership/transition-control-membership.usecase.ts';
import type { ControlOrderReader } from '../foundations/ports/control-order-reader/control-order-reader.port.ts';

export type ControlCustomerCapabilities = Readonly<{
  list: ListControlCustomersPort;
  get: GetControlCustomerPort;
  create: CreateControlCustomerPort;
  update: UpdateControlCustomerPort;
}>;

export type ControlOrderCapabilities = Readonly<{
  list: ListControlOrdersPort;
  get: ControlOrderReader;
  create: CreateControlOrderPort;
  correct: CorrectControlOrderPort;
}>;

export type ControlWorkforceCapabilities = Readonly<{
  listMembers: ListControlMembersPort;
  getMember: GetControlMemberPort;
  listMemberSessions: ListControlMemberSessionsPort;
  revokeMemberSessions: RevokeControlMemberSessionsPort;
  transitionMembership: TransitionControlMembershipPort;
  grantAccess: GrantControlAccessPort;
  revokeAccess: RevokeControlAccessPort;
  listInvitations: ListControlInvitationsPort;
  issueInvitation: IssueControlInvitationPort;
  reissueInvitation: ReissueControlInvitationPort;
  revokeInvitation: RevokeControlInvitationPort;
  previewInvitation: PreviewControlInvitationPort;
  acceptInvitation: AcceptControlInvitationPort;
  listSecurityEvents: ReadControlSecurityEventsPort;
}>;

export type ControlExperienceDeps = Readonly<{
  db: Database;
  clock: Clock;
  controlOrigin: string;
  processorOrigin: string;
  customers: ControlCustomerCapabilities;
  orders: ControlOrderCapabilities;
  workforce: ControlWorkforceCapabilities;
}>;

export const makeControlExperience = (deps: ControlExperienceDeps) => {
  const access = makeResolveControlAccess({
    repo: makePostgresResolveControlAccessRepository(deps.db),
    clock: deps.clock,
    controlOrigin: deps.controlOrigin,
    processorOrigin: deps.processorOrigin,
  });

  return Object.freeze({
    access,
    customers: Object.freeze({
      list: makeListControlCustomers(deps.customers.list),
      get: makeGetControlCustomer(deps.customers.get),
      create: makeCreateControlCustomer(deps.customers.create),
      update: makeUpdateControlCustomer(deps.customers.update),
    }),
    orders: Object.freeze({
      list: makeListControlOrders(deps.orders.list),
      get: makeGetControlOrder(deps.orders.get),
      create: makeCreateControlOrder(deps.orders.create),
      correct: makeCorrectControlOrder({
        getOrder: deps.orders.get,
        correctOrder: deps.orders.correct,
      }),
    }),
    workforce: Object.freeze({
      listMembers: makeListControlMembers(deps.workforce.listMembers),
      getMember: makeGetControlMember(deps.workforce.getMember),
      listMemberSessions: makeListControlMemberSessions(
        deps.workforce.listMemberSessions,
      ),
      revokeMemberSessions: makeRevokeControlMemberSessions(
        deps.workforce.revokeMemberSessions,
      ),
      transitionMembership: makeTransitionControlMembership(
        deps.workforce.transitionMembership,
      ),
      grantAccess: makeGrantControlAccess(deps.workforce.grantAccess),
      revokeAccess: makeRevokeControlAccess(deps.workforce.revokeAccess),
    }),
    invitations: Object.freeze({
      list: makeListControlInvitations(deps.workforce.listInvitations),
      issue: makeIssueControlInvitation(deps.workforce.issueInvitation),
      reissue: makeReissueControlInvitation(deps.workforce.reissueInvitation),
      revoke: makeRevokeControlInvitation(deps.workforce.revokeInvitation),
      preview: makePreviewControlInvitation(deps.workforce.previewInvitation),
      accept: makeAcceptControlInvitation(deps.workforce.acceptInvitation),
    }),
    security: Object.freeze({
      listEvents: makeReadControlSecurityEvents(
        deps.workforce.listSecurityEvents,
      ),
    }),
  });
};

export type ControlExperience = ReturnType<typeof makeControlExperience>;
