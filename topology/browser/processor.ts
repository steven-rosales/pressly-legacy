import {
  createProcessorBrowserExperience,
  ProcessorErrorFallback,
  type ProcessorBrowserCapabilities,
} from '@pressly/experience-processor/browser';
import { processorBrowserOperations } from '../browser-operations.js';
import {
  makeProcessorRuntime,
  type ProcessorBrowserHostEffects,
  type ProcessorBrowserOperationBindings,
} from '../runtime/browser/public.js';
import { createElement, type ReactElement, type ReactNode } from 'react';

export const processorBrowserOperationBindings = Object.freeze({
  authentication: Object.freeze({
    login: processorBrowserOperations['processor.auth-login.v1'],
    completeMfaChallenge:
      processorBrowserOperations['processor.complete-mfa-challenge.v1'],
    loadSession: processorBrowserOperations['processor.load-auth-session.v1'],
    logout: processorBrowserOperations['processor.logout.v1'],
  }),
  orders: Object.freeze({
    listIncomingOrders:
      processorBrowserOperations['orders.list-incoming-order-proposals.v1'],
    acceptIncomingOrder:
      processorBrowserOperations['orders.accept-incoming-order-proposal.v1'],
    rejectIncomingOrder:
      processorBrowserOperations['orders.reject-incoming-order-proposal.v1'],
    restoreIncomingOrder:
      processorBrowserOperations['orders.restore-incoming-order-proposal.v1'],
  }),
  acceptSchedule: processorBrowserOperations['production.accept-schedule.v1'],
  advanceStage: processorBrowserOperations['production.advance-stage.v1'],
  assignStageMachines:
    processorBrowserOperations['production.assign-stage-machines.v1'],
  changeAdmission: processorBrowserOperations['production.change-admission.v1'],
  changeOrderResolution:
    processorBrowserOperations['production.change-order-resolution.v1'],
  commitOrderBacklog:
    processorBrowserOperations['production.commit-order-backlog.v1'],
  commitOrderRoute:
    processorBrowserOperations['production.commit-order-route.v1'],
  confirmOrderOvertime:
    processorBrowserOperations['production.confirm-order-overtime.v1'],
  createSchedule: processorBrowserOperations['production.create-schedule.v1'],
  createShift: processorBrowserOperations['production.create-shift.v1'],
  freezeBatchMembership:
    processorBrowserOperations['production.freeze-batch-membership.v1'],
  listHistoryActivity:
    processorBrowserOperations['processor.list-production-history-activity.v1'],
  listHistoryPlans:
    processorBrowserOperations['production.list-history-plans.v1'],
  listHistoryRuns:
    processorBrowserOperations['production.list-history-runs.v1'],
  listLocations: processorBrowserOperations['production.list-locations.v1'],
  listOrderControl:
    processorBrowserOperations['processor.list-production-order-control.v1'],
  listOrders: processorBrowserOperations['production.list-orders.v1'],
  loadBoard: processorBrowserOperations['processor.load-production-board.v1'],
  loadHistoryRun:
    processorBrowserOperations['processor.load-production-history-run.v1'],
  loadRemainingDayForecast:
    processorBrowserOperations['processor.load-remaining-day-forecast.v1'],
  loadSchedule: processorBrowserOperations['production.load-schedule.v1'],
  loadWorkspace:
    processorBrowserOperations['processor.load-production-workspace.v1'],
  placeOrderAutomatically:
    processorBrowserOperations['production.place-order-automatically.v1'],
  placeOrderExactly:
    processorBrowserOperations['production.place-order-exactly.v1'],
  previewOrderBacklog:
    processorBrowserOperations['processor.preview-production-order-backlog.v1'],
  previewOrderRoute:
    processorBrowserOperations['production.preview-order-route.v1'],
  publishSchedulerConfig:
    processorBrowserOperations['production.publish-scheduler-config.v1'],
  reconcileBatchProgress:
    processorBrowserOperations['production.reconcile-batch-progress.v1'],
  recordOrderIntake:
    processorBrowserOperations['production.record-order-intake.v1'],
  replaceShiftSelection:
    processorBrowserOperations['production.replace-shift-selection.v1'],
  setOrderPriority:
    processorBrowserOperations['production.set-order-priority.v1'],
  startSchedule: processorBrowserOperations['production.start-schedule.v1'],
  subscribeChanges:
    processorBrowserOperations['production.subscribe-changes.v1'],
  unfreezeBatchMembership:
    processorBrowserOperations['production.unfreeze-batch-membership.v1'],
  updateShift: processorBrowserOperations['production.update-shift.v1'],
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
} from '@pressly/experience-processor/browser';
export type {
  IdempotencyPort,
  LocationPreferencePort,
  ProcessorBrowserCapabilities,
  ProcessorBrowserKeyInput,
  ProductionChangePort,
  RequestFailure,
  RequestFailureKind,
  RequestInput,
  RequestPort,
} from '@pressly/experience-processor/browser';
export type { DescribeSubscribeChangesEventSource } from '@pressly/experience-processor';
export { makeProcessorRuntime } from '../runtime/browser/public.js';
export type {
  ProcessorBrowserHostEffects,
  ProcessorBrowserOperationBindings,
  ProcessorConnectionStateObserver,
  ProcessorRequestFailureContext,
  ProcessorRequestFailureObserver,
} from '../runtime/browser/public.js';
