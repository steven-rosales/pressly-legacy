import {
  makeAcceptScheduleClient,
  makeAdvanceStageClient,
  makeAssignStageMachinesClient,
  makeChangeAdmissionClient,
  makeChangeOrderResolutionClient,
  makeCommitOrderBacklogClient,
  makeCommitOrderRouteClient,
  makeConfirmOrderOvertimeClient,
  makeCreateScheduleClient,
  makeCreateShiftClient,
  makeDescribeSubscribeChangesEventSource,
  makeFreezeBatchMembershipClient,
  makeListHistoryPlansClient,
  makeListHistoryRunsClient,
  makeListLocationsClient,
  makeListOrdersClient,
  makeListProductionHistoryActivityClient,
  makeListProductionOrderControlClient,
  makeLoadProductionBoardClient,
  makeLoadProductionHistoryRunClient,
  makeLoadProductionWorkspaceClient,
  makeLoadRemainingDayForecastClient,
  makeLoadScheduleClient,
  makePlaceOrderAutomaticallyClient,
  makePlaceOrderExactlyClient,
  makePreviewOrderRouteClient,
  makePreviewProductionOrderBacklogClient,
  makePublishSchedulerConfigClient,
  makeRecordOrderIntakeClient,
  makeReconcileBatchProgressClient,
  makeReplaceShiftSelectionClient,
  makeSetOrderPriorityClient,
  makeStartScheduleClient,
  makeUnfreezeBatchMembershipClient,
  makeUpdateShiftClient,
  type DescribeSubscribeChangesEventSource,
} from '@pressly/experience-processor';
import {
  makeProcessorAuthenticationBrowserClient,
  makeProcessorBrowserRequestTransport,
  makeProcessorOrdersBrowserClient,
  type IdempotencyPort,
  type LocationPreferencePort,
  type ProductionChangePort,
  type ProductionPort,
  type RequestFailure,
  type RequestPort,
  type ProcessorRuntime,
} from '@pressly/experience-processor/browser';
import type { Clock } from '@pressly/time';

export type ProcessorRequestFailureContext = Readonly<{
  method: string;
  path: string;
}>;

export type ProcessorRequestFailureObserver = (
  failure: RequestFailure,
  context: ProcessorRequestFailureContext,
) => void;

export type ProcessorConnectionStateObserver =
  ProcessorRuntime['observeConnectionState'];

type OperationFor<Factory> = Factory extends (input: infer Input) => unknown
  ? Input extends Readonly<{ operation: infer Operation }>
    ? Operation
    : never
  : never;

export type ProcessorBrowserOperationBindings = Readonly<{
  authentication: Parameters<
    typeof makeProcessorAuthenticationBrowserClient
  >[0]['operations'];
  orders: Parameters<typeof makeProcessorOrdersBrowserClient>[0]['operations'];
  acceptSchedule: OperationFor<typeof makeAcceptScheduleClient>;
  advanceStage: OperationFor<typeof makeAdvanceStageClient>;
  assignStageMachines: OperationFor<typeof makeAssignStageMachinesClient>;
  changeAdmission: OperationFor<typeof makeChangeAdmissionClient>;
  changeOrderResolution: OperationFor<typeof makeChangeOrderResolutionClient>;
  commitOrderBacklog: OperationFor<typeof makeCommitOrderBacklogClient>;
  commitOrderRoute: OperationFor<typeof makeCommitOrderRouteClient>;
  confirmOrderOvertime: OperationFor<typeof makeConfirmOrderOvertimeClient>;
  createSchedule: OperationFor<typeof makeCreateScheduleClient>;
  createShift: OperationFor<typeof makeCreateShiftClient>;
  freezeBatchMembership: OperationFor<typeof makeFreezeBatchMembershipClient>;
  listHistoryActivity: OperationFor<
    typeof makeListProductionHistoryActivityClient
  >;
  listHistoryPlans: OperationFor<typeof makeListHistoryPlansClient>;
  listHistoryRuns: OperationFor<typeof makeListHistoryRunsClient>;
  listLocations: OperationFor<typeof makeListLocationsClient>;
  listOrderControl: OperationFor<typeof makeListProductionOrderControlClient>;
  listOrders: OperationFor<typeof makeListOrdersClient>;
  loadBoard: OperationFor<typeof makeLoadProductionBoardClient>;
  loadHistoryRun: OperationFor<typeof makeLoadProductionHistoryRunClient>;
  loadRemainingDayForecast: OperationFor<
    typeof makeLoadRemainingDayForecastClient
  >;
  loadSchedule: OperationFor<typeof makeLoadScheduleClient>;
  loadWorkspace: OperationFor<typeof makeLoadProductionWorkspaceClient>;
  placeOrderAutomatically: OperationFor<
    typeof makePlaceOrderAutomaticallyClient
  >;
  placeOrderExactly: OperationFor<typeof makePlaceOrderExactlyClient>;
  previewOrderBacklog: OperationFor<
    typeof makePreviewProductionOrderBacklogClient
  >;
  previewOrderRoute: OperationFor<typeof makePreviewOrderRouteClient>;
  publishSchedulerConfig: OperationFor<typeof makePublishSchedulerConfigClient>;
  reconcileBatchProgress: OperationFor<typeof makeReconcileBatchProgressClient>;
  recordOrderIntake: OperationFor<typeof makeRecordOrderIntakeClient>;
  replaceShiftSelection: OperationFor<typeof makeReplaceShiftSelectionClient>;
  setOrderPriority: OperationFor<typeof makeSetOrderPriorityClient>;
  startSchedule: OperationFor<typeof makeStartScheduleClient>;
  subscribeChanges: OperationFor<
    typeof makeDescribeSubscribeChangesEventSource
  >;
  unfreezeBatchMembership: OperationFor<
    typeof makeUnfreezeBatchMembershipClient
  >;
  updateShift: OperationFor<typeof makeUpdateShiftClient>;
}>;

export type ProcessorBrowserHostEffects = Readonly<{
  makeRequest: (
    input: Readonly<{
      readCsrfToken: () => string | null;
      onUnauthorized: () => void;
      onFailure: ProcessorRequestFailureObserver;
    }>,
  ) => RequestPort;
  makeProductionChanges: (
    describeSubscription: DescribeSubscribeChangesEventSource,
  ) => ProductionChangePort;
  locationPreference: LocationPreferencePort;
  idempotency: IdempotencyPort;
  now: Clock['now'];
  observeRequestFailure: ProcessorRequestFailureObserver;
  observeConnectionState: ProcessorConnectionStateObserver;
}>;

export const makeProcessorRuntime = (input: {
  operations: ProcessorBrowserOperationBindings;
  effects: ProcessorBrowserHostEffects;
}): ProcessorRuntime => {
  let csrfToken: string | null = null;
  const unauthorizedListeners = new Set<() => void>();
  const clearCsrfToken = () => {
    csrfToken = null;
  };

  const request = input.effects.makeRequest({
    readCsrfToken: () => csrfToken,
    onFailure: input.effects.observeRequestFailure,
    onUnauthorized: () => {
      clearCsrfToken();
      unauthorizedListeners.forEach((listener) => listener());
    },
  });
  const browserRequest = makeProcessorBrowserRequestTransport(request);
  const authentication = makeProcessorAuthenticationBrowserClient({
    operations: input.operations.authentication,
    request: browserRequest,
    acceptCsrfToken: (token) => {
      csrfToken = token;
    },
    clearCsrfToken,
  });
  const orderManagement = makeProcessorOrdersBrowserClient({
    operations: input.operations.orders,
    request: browserRequest,
  });
  const advanceStage = makeAdvanceStageClient({
    operation: input.operations.advanceStage,
    request,
  });
  const acceptSchedule = makeAcceptScheduleClient({
    operation: input.operations.acceptSchedule,
    request,
  });
  const startSchedule = makeStartScheduleClient({
    operation: input.operations.startSchedule,
    request,
  });
  const assignStageMachines = makeAssignStageMachinesClient({
    operation: input.operations.assignStageMachines,
    request,
  });
  const changeAdmission = makeChangeAdmissionClient({
    operation: input.operations.changeAdmission,
    request,
  });
  const changeOrderResolution = makeChangeOrderResolutionClient({
    operation: input.operations.changeOrderResolution,
    request,
  });
  const commitOrderBacklog = makeCommitOrderBacklogClient({
    operation: input.operations.commitOrderBacklog,
    request,
  });
  const commitOrderRoute = makeCommitOrderRouteClient({
    operation: input.operations.commitOrderRoute,
    request,
  });
  const retryAutomaticPlacement = makePlaceOrderAutomaticallyClient({
    operation: input.operations.placeOrderAutomatically,
    request,
  });
  const placeOrderExactly = makePlaceOrderExactlyClient({
    operation: input.operations.placeOrderExactly,
    request,
  });
  const confirmPlacementOvertime = makeConfirmOrderOvertimeClient({
    operation: input.operations.confirmOrderOvertime,
    request,
  });
  const createSchedule = makeCreateScheduleClient({
    operation: input.operations.createSchedule,
    request,
  });
  const createShift = makeCreateShiftClient({
    operation: input.operations.createShift,
    request,
  });
  const replaceShiftSelection = makeReplaceShiftSelectionClient({
    operation: input.operations.replaceShiftSelection,
    request,
  });
  const updateShift = makeUpdateShiftClient({
    operation: input.operations.updateShift,
    request,
  });
  const freezeBatch = makeFreezeBatchMembershipClient({
    operation: input.operations.freezeBatchMembership,
    request,
  });
  const unfreezeBatch = makeUnfreezeBatchMembershipClient({
    operation: input.operations.unfreezeBatchMembership,
    request,
  });
  const reconcileBatchProgress = makeReconcileBatchProgressClient({
    operation: input.operations.reconcileBatchProgress,
    request,
  });
  const setPriority = makeSetOrderPriorityClient({
    operation: input.operations.setOrderPriority,
    request,
  });
  const listHistoryPlans = makeListHistoryPlansClient({
    operation: input.operations.listHistoryPlans,
    request,
  });
  const listHistoryRuns = makeListHistoryRunsClient({
    operation: input.operations.listHistoryRuns,
    request,
  });
  const listLocations = makeListLocationsClient({
    operation: input.operations.listLocations,
    request,
  });
  const listOrders = makeListOrdersClient({
    operation: input.operations.listOrders,
    request,
  });
  const loadBoard = makeLoadProductionBoardClient({
    operation: input.operations.loadBoard,
    request,
  });
  const loadWorkspace = makeLoadProductionWorkspaceClient({
    operation: input.operations.loadWorkspace,
    request,
  });
  const loadRemainingDayForecast = makeLoadRemainingDayForecastClient({
    operation: input.operations.loadRemainingDayForecast,
    request,
  });
  const previewOrderBacklog = makePreviewProductionOrderBacklogClient({
    operation: input.operations.previewOrderBacklog,
    request,
  });
  const listHistoryActivity = makeListProductionHistoryActivityClient({
    operation: input.operations.listHistoryActivity,
    request,
  });
  const loadHistoryRun = makeLoadProductionHistoryRunClient({
    operation: input.operations.loadHistoryRun,
    request,
  });
  const listOrderControl = makeListProductionOrderControlClient({
    operation: input.operations.listOrderControl,
    request,
  });
  const loadSchedule = makeLoadScheduleClient({
    operation: input.operations.loadSchedule,
    request,
  });
  const previewOrderRoute = makePreviewOrderRouteClient({
    operation: input.operations.previewOrderRoute,
    request,
  });
  const publishConfig = makePublishSchedulerConfigClient({
    operation: input.operations.publishSchedulerConfig,
    request,
  });
  const recordIntake = makeRecordOrderIntakeClient({
    operation: input.operations.recordOrderIntake,
    request,
  });
  const describeProductionChanges = makeDescribeSubscribeChangesEventSource({
    operation: input.operations.subscribeChanges,
  });

  return {
    authentication,
    orderManagement,
    production: {
      acceptSchedule,
      advanceStage,
      assignStageMachines,
      changeAdmission,
      changeOrderResolution,
      commitOrderBacklog,
      commitOrderRoute,
      createSchedule,
      createShift,
      freezeBatch,
      listHistoryPlans,
      listHistoryActivity,
      listHistoryRuns,
      listLocations,
      listOrderControl,
      listOrders,
      loadBoard,
      loadHistoryRun,
      loadRemainingDayForecast,
      loadSchedule,
      loadWorkspace,
      previewOrderBacklog,
      previewOrderRoute,
      publishConfig,
      retryAutomaticPlacement,
      placeOrderExactly,
      confirmPlacementOvertime,
      recordIntake,
      reconcileBatchProgress,
      replaceShiftSelection,
      setPriority,
      startSchedule,
      unfreezeBatch,
      updateShift,
    } satisfies ProductionPort,

    productionChanges: input.effects.makeProductionChanges(
      describeProductionChanges,
    ),

    locationPreference: input.effects.locationPreference,
    idempotency: input.effects.idempotency,

    subscribeToUnauthorized: (listener) => {
      unauthorizedListeners.add(listener);
      return () => {
        unauthorizedListeners.delete(listener);
      };
    },
    observeConnectionState: input.effects.observeConnectionState,

    now: input.effects.now,
  };
};
