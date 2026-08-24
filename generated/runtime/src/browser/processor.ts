/* This file is generated from the checked deployment topology. */
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
} from '@pressly/topology/runtime/browser';
