export const controlBrowserRuntimeTemplate = `/* This file is generated from the checked deployment topology. */
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
export { makeControlBrowserClients } from '@pressly/topology/runtime/browser';\n`;

export const processorBrowserRuntimeTemplate = `/* This file is generated from the checked deployment topology. */
import {
  createProcessorBrowserExperience,
  ProcessorErrorFallback,
  type ProcessorBrowserCapabilities,
} from '@pressly/experience-processor/browser';
import {
  processorClient,
  processorListProductionHistoryActivityV1,
  processorListProductionOrderControlV1,
  processorLoadProductionBoardV1,
  processorLoadProductionHistoryRunV1,
  processorLoadProductionWorkspaceV1,
  processorLoadRemainingDayForecastV1,
  processorPreviewProductionOrderBacklogV1,
  productionAcceptScheduleV1,
  productionAdvanceStageV1,
  productionAssignStageMachinesV1,
  productionChangeAdmissionV1,
  productionChangeOrderResolutionV1,
  productionCommitOrderBacklogV1,
  productionCommitOrderRouteV1,
  productionConfirmOrderOvertimeV1,
  productionCreateScheduleV1,
  productionCreateShiftV1,
  productionFreezeBatchMembershipV1,
  productionListHistoryPlansV1,
  productionListHistoryRunsV1,
  productionListLocationsV1,
  productionListOrdersV1,
  productionLoadScheduleV1,
  productionPlaceOrderAutomaticallyV1,
  productionPlaceOrderExactlyV1,
  productionPreviewOrderRouteV1,
  productionPublishSchedulerConfigV1,
  productionRecordOrderIntakeV1,
  productionReconcileBatchProgressV1,
  productionReplaceShiftSelectionV1,
  productionSetOrderPriorityV1,
  productionStartScheduleV1,
  productionSubscribeChangesV1,
  productionUnfreezeBatchMembershipV1,
  productionUpdateShiftV1,
} from '@pressly/generated/clients/processor';
import {
  makeProcessorRuntime,
  type ProcessorBrowserHostEffects,
  type ProcessorBrowserOperationBindings,
} from '@pressly/topology/runtime/browser';
import { createElement, type ReactElement, type ReactNode } from 'react';

export const processorBrowserOperationBindings = Object.freeze({
  authentication: Object.freeze({
    login: processorClient.operations['processor.auth-login.v1'],
    completeMfaChallenge:
      processorClient.operations['processor.complete-mfa-challenge.v1'],
    loadSession: processorClient.operations['processor.load-auth-session.v1'],
    logout: processorClient.operations['processor.logout.v1'],
  }),
  orders: Object.freeze({
    listIncomingOrders:
      processorClient.operations['orders.list-incoming-order-proposals.v1'],
    acceptIncomingOrder:
      processorClient.operations['orders.accept-incoming-order-proposal.v1'],
    rejectIncomingOrder:
      processorClient.operations['orders.reject-incoming-order-proposal.v1'],
    restoreIncomingOrder:
      processorClient.operations['orders.restore-incoming-order-proposal.v1'],
  }),
  acceptSchedule: productionAcceptScheduleV1,
  advanceStage: productionAdvanceStageV1,
  assignStageMachines: productionAssignStageMachinesV1,
  changeAdmission: productionChangeAdmissionV1,
  changeOrderResolution: productionChangeOrderResolutionV1,
  commitOrderBacklog: productionCommitOrderBacklogV1,
  commitOrderRoute: productionCommitOrderRouteV1,
  confirmOrderOvertime: productionConfirmOrderOvertimeV1,
  createSchedule: productionCreateScheduleV1,
  createShift: productionCreateShiftV1,
  freezeBatchMembership: productionFreezeBatchMembershipV1,
  listHistoryActivity: processorListProductionHistoryActivityV1,
  listHistoryPlans: productionListHistoryPlansV1,
  listHistoryRuns: productionListHistoryRunsV1,
  listLocations: productionListLocationsV1,
  listOrderControl: processorListProductionOrderControlV1,
  listOrders: productionListOrdersV1,
  loadBoard: processorLoadProductionBoardV1,
  loadHistoryRun: processorLoadProductionHistoryRunV1,
  loadRemainingDayForecast: processorLoadRemainingDayForecastV1,
  loadSchedule: productionLoadScheduleV1,
  loadWorkspace: processorLoadProductionWorkspaceV1,
  placeOrderAutomatically: productionPlaceOrderAutomaticallyV1,
  placeOrderExactly: productionPlaceOrderExactlyV1,
  previewOrderBacklog: processorPreviewProductionOrderBacklogV1,
  previewOrderRoute: productionPreviewOrderRouteV1,
  publishSchedulerConfig: productionPublishSchedulerConfigV1,
  reconcileBatchProgress: productionReconcileBatchProgressV1,
  recordOrderIntake: productionRecordOrderIntakeV1,
  replaceShiftSelection: productionReplaceShiftSelectionV1,
  setOrderPriority: productionSetOrderPriorityV1,
  startSchedule: productionStartScheduleV1,
  subscribeChanges: productionSubscribeChangesV1,
  unfreezeBatchMembership: productionUnfreezeBatchMembershipV1,
  updateShift: productionUpdateShiftV1,
}) satisfies ProcessorBrowserOperationBindings;

export type CreateProcessorBrowserApplicationInput = Readonly<{
  browser: ProcessorBrowserCapabilities;
  effects: ProcessorBrowserHostEffects;
  wrapRoot: (
    input: Readonly<{
      node: ReactNode;
      fallback: ReactElement;
    }>,
  ) => ReactNode;
}>;

export const createProcessorBrowserApplication = (
  input: CreateProcessorBrowserApplicationInput,
) => {
  const application = createProcessorBrowserExperience({
    browser: input.browser,
    runtime: makeProcessorRuntime({
      operations: processorBrowserOperationBindings,
      effects: input.effects,
    }),
  });

  return Object.freeze({
    ...application,
    node: input.wrapRoot({
      node: application.node,
      fallback: createElement(ProcessorErrorFallback),
    }),
  });
};

export {
  makeProcessorBrowserRequestTransport,
  requestFailure,
  type IdempotencyPort,
  type LocationPreferencePort,
  type ProcessorBrowserCapabilities,
  type ProcessorBrowserKeyInput,
  type ProductionChangePort,
  type RequestFailure,
  type RequestFailureKind,
  type RequestInput,
  type RequestPort,
} from '@pressly/experience-processor/browser';
export type { DescribeSubscribeChangesEventSource } from '@pressly/experience-processor';
export {
  makeProcessorRuntime,
  type ProcessorBrowserHostEffects,
  type ProcessorConnectionStateObserver,
  type ProcessorRequestFailureContext,
  type ProcessorRequestFailureObserver,
} from '@pressly/topology/runtime/browser';\n`;

export const customerBrowserRuntimeTemplate = `/* This file is generated from the checked deployment topology. */
import {
  makeCustomerBrowserRequestTransport,
  makeCustomerPricingBrowserClient,
} from '@pressly/experience-customer/browser';
import {
  createCustomerWebExperience,
  type CustomerWebExperience,
  type PricingCatalogLoader,
  type WebCore,
  type WebCorePorts,
} from '@pressly/experience-customer/web';
import { pricingLoadPricingCatalogV1 } from '@pressly/generated/clients/customer';

export const customerWeb: CustomerWebExperience = createCustomerWebExperience();

export type {
  PricingCatalogLoader,
  RequestClient,
  RequestInput,
  WebCore,
} from '@pressly/experience-customer/web';

export const createCustomerWebRuntime = (input: WebCorePorts): WebCore =>
  customerWeb.createCore(input);

export const makeCustomerPricingCatalogLoader = (
  input: Readonly<{
    core: WebCore;
    staticOnly: boolean;
    next?: Readonly<{ revalidate?: number; tags?: string[] }>;
  }>,
): PricingCatalogLoader => {
  const pricing = makeCustomerPricingBrowserClient({
    operation: pricingLoadPricingCatalogV1,
    request: makeCustomerBrowserRequestTransport({
      request: input.core.request,
      ...(input.next === undefined ? {} : { next: input.next }),
    }),
  });
  const queries = customerWeb.pricing.makeQueries({
    query: input.core.query,
    pricing,
  });

  return Object.freeze((request) =>
    customerWeb.pricing.loadCatalogViewModel(queries, request, {
      staticOnly: input.staticOnly,
    }),
  );
};\n`;

export const customerClientBrowserRuntimeTemplate = `/* This file is generated from the checked deployment topology. */
import {
  createCustomerWebClientExperience,
  type CustomerWebClientExperience,
} from '@pressly/experience-customer/web-client';
import type { WebCore, WebCorePorts } from '@pressly/experience-customer/web';

export const customerWebClient: CustomerWebClientExperience =
  createCustomerWebClientExperience();

export type { CustomerBrowserCapabilities } from '@pressly/experience-customer/web-client';

export const createCustomerWebClientRuntime = (input: WebCorePorts): WebCore =>
  customerWebClient.createCore(input);\n`;
