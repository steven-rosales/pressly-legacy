import { makeAcceptSchedule } from './accept-schedule/accept-schedule.usecase.ts';
import { makeAcceptScheduleRoute } from './accept-schedule/accept-schedule.route.ts';
import { makeAcceptScheduleRepository } from './accept-schedule/accept-schedule.repo.ts';
import type { AcceptScheduleRepository } from './accept-schedule/accept-schedule.port.ts';
import { makeApplyFulfillmentDemandRepository } from './apply-fulfillment-demand/apply-fulfillment-demand.repo.ts';
import { makeApplyFulfillmentDemand } from './apply-fulfillment-demand/apply-fulfillment-demand.usecase.ts';
import type { ApplyFulfillmentDemandRepository } from './apply-fulfillment-demand/apply-fulfillment-demand.port.ts';
import { makeAdvanceProductionStage } from './advance-production-stage/advance-production-stage.usecase.ts';
import { makeAdvanceProductionStageRoute } from './advance-production-stage/advance-production-stage.route.ts';
import { makeAdvanceProductionStageRepository } from './advance-production-stage/advance-production-stage.repo.ts';
import type { AdvanceProductionStageRepository } from './advance-production-stage/advance-production-stage.port.ts';
import { makeAssignStageMachines } from './assign-stage-machines/assign-stage-machines.usecase.ts';
import { makeAssignStageMachinesRoute } from './assign-stage-machines/assign-stage-machines.route.ts';
import { makeAssignStageMachinesRepository } from './assign-stage-machines/assign-stage-machines.repo.ts';
import type { AssignStageMachinesRepository } from './assign-stage-machines/assign-stage-machines.port.ts';
import { makeChangeProductionAdmission } from './change-production-admission/change-production-admission.usecase.ts';
import { makeChangeProductionAdmissionRoute } from './change-production-admission/change-production-admission.route.ts';
import { makeChangeProductionAdmissionRepository } from './change-production-admission/change-production-admission.repo.ts';
import type { ChangeProductionAdmissionRepository } from './change-production-admission/change-production-admission.port.ts';
import { makeChangeProductionOrderResolution } from './change-production-order-resolution/change-production-order-resolution.usecase.ts';
import { makeChangeProductionOrderResolutionRoute } from './change-production-order-resolution/change-production-order-resolution.route.ts';
import { makeChangeProductionOrderResolutionRepository } from './change-production-order-resolution/change-production-order-resolution.repo.ts';
import type { ChangeProductionOrderResolutionRepository } from './change-production-order-resolution/change-production-order-resolution.port.ts';
import { makeCreateSchedule } from './create-schedule/create-schedule.usecase.ts';
import { makeCreateScheduleRoute } from './create-schedule/create-schedule.route.ts';
import { makeCreateScheduleRepository } from './create-schedule/create-schedule.repo.ts';
import type { CreateScheduleRepository } from './create-schedule/create-schedule.port.ts';
import { makeListProductionLocations } from './list-production-locations/list-production-locations.usecase.ts';
import { makeListProductionLocationsRoute } from './list-production-locations/list-production-locations.route.ts';
import { makeListProductionLocationsRepository } from './list-production-locations/list-production-locations.repo.ts';
import type { ListProductionLocationsRepository } from './list-production-locations/list-production-locations.port.ts';
import { makeListProductionOrders } from './list-production-orders/list-production-orders.usecase.ts';
import { makeListProductionOrdersRoute } from './list-production-orders/list-production-orders.route.ts';
import { makeListProductionOrdersRepository } from './list-production-orders/list-production-orders.repo.ts';
import type { ListProductionOrdersRepository } from './list-production-orders/list-production-orders.port.ts';
import { makeListProductionOrderControl } from './list-production-order-control/list-production-order-control.usecase.ts';
import { makeListProductionOrderControlRoute } from './list-production-order-control/list-production-order-control.route.ts';
import { makeListProductionOrderControlRepository } from './list-production-order-control/list-production-order-control.repo.ts';
import type { ListProductionOrderControlRepository } from './list-production-order-control/list-production-order-control.port.ts';
import { makeListProductionHistory } from './list-production-history/list-production-history.usecase.ts';
import { makeListProductionHistoryRoute } from './list-production-history/list-production-history.route.ts';
import { makeListProductionHistoryRepository } from './list-production-history/list-production-history.repo.ts';
import type { ProductionHistoryRepository } from './list-production-history/list-production-history.port.ts';
import { makeLoadProductionBoard } from './load-production-board/load-production-board.usecase.ts';
import { makeLoadProductionBoardRoute } from './load-production-board/load-production-board.route.ts';
import { makeLoadProductionBoardRepository } from './load-production-board/load-production-board.repo.ts';
import type { LoadProductionBoardRepository } from './load-production-board/load-production-board.port.ts';
import { makeLoadSchedule } from './load-schedule/load-schedule.usecase.ts';
import { makeLoadScheduleRoute } from './load-schedule/load-schedule.route.ts';
import { makeLoadScheduleRepository } from './load-schedule/load-schedule.repo.ts';
import type { LoadScheduleRepository } from './load-schedule/load-schedule.port.ts';
import { makeLoadProductionWorkspace } from './load-production-workspace/load-production-workspace.usecase.ts';
import { makeLoadProductionWorkspaceRoute } from './load-production-workspace/load-production-workspace.route.ts';
import { makeLoadProductionWorkspaceRepository } from './load-production-workspace/load-production-workspace.repo.ts';
import type { LoadProductionWorkspaceRepository } from './load-production-workspace/load-production-workspace.port.ts';
import { makeLoadRemainingDayForecast } from './load-remaining-day-forecast/load-remaining-day-forecast.usecase.ts';
import { makeLoadRemainingDayForecastRoute } from './load-remaining-day-forecast/load-remaining-day-forecast.route.ts';
import { makeLoadRemainingDayForecastRepository } from './load-remaining-day-forecast/load-remaining-day-forecast.repo.ts';
import type { LoadRemainingDayForecast } from './load-remaining-day-forecast/load-remaining-day-forecast.port.ts';
import { makeManageBatchMembership } from './manage-batch-membership/manage-batch-membership.usecase.ts';
import { makeManageBatchMembershipRoute } from './manage-batch-membership/manage-batch-membership.route.ts';
import { makeManageBatchMembershipRepository } from './manage-batch-membership/manage-batch-membership.repo.ts';
import type { ManageBatchMembershipRepository } from './manage-batch-membership/manage-batch-membership.port.ts';
import { makeManageProductionResources } from './manage-production-resources/manage-production-resources.usecase.ts';
import { makeManageProductionResourcesRepository } from './manage-production-resources/manage-production-resources.repo.ts';
import type { ManageProductionResourcesRepository } from './manage-production-resources/manage-production-resources.port.ts';
import {
  makeCreateProductionShift,
  makeUpdateProductionShift,
} from './manage-production-shift/manage-production-shift.usecase.ts';
import {
  makeCreateProductionShiftRoute,
  makeUpdateProductionShiftRoute,
} from './manage-production-shift/manage-production-shift.route.ts';
import { makeManageProductionShiftRepository } from './manage-production-shift/manage-production-shift.repo.ts';
import type { ManageProductionShiftRepository } from './manage-production-shift/manage-production-shift.port.ts';
import { makePlaceProductionOrder } from './place-production-order/place-production-order.usecase.ts';
import { makePlaceProductionOrderRoutes } from './place-production-order/place-production-order.route.ts';
import { makePlaceProductionOrderRepository } from './place-production-order/place-production-order.repo.ts';
import type { PlaceProductionOrderRepository } from './place-production-order/place-production-order.port.ts';
import type {
  ClockPort,
  IdPort,
  ProductionApplicationSchedulerPort,
  ProductionPolicyPort,
  ProductionSignalsPort,
  ProductionSchedulerPort,
} from './production.port.ts';
import { nullProductionSignals } from './production.port.ts';
import { makePublishSchedulerConfig } from './publish-scheduler-config/publish-scheduler-config.usecase.ts';
import { makePublishSchedulerConfigRoute } from './publish-scheduler-config/publish-scheduler-config.route.ts';
import { makePublishSchedulerConfigRepository } from './publish-scheduler-config/publish-scheduler-config.repo.ts';
import type { PublishSchedulerConfigRepository } from './publish-scheduler-config/publish-scheduler-config.port.ts';
import { makeRecordOrderIntake } from './record-order-intake/record-order-intake.usecase.ts';
import { makeRecordOrderIntakeRoute } from './record-order-intake/record-order-intake.route.ts';
import { makeRecordOrderIntakeRepository } from './record-order-intake/record-order-intake.repo.ts';
import type { RecordOrderIntakeRepository } from './record-order-intake/record-order-intake.port.ts';
import { makeReviewProductionOrderBacklogRepository } from './review-production-order-backlog/review-production-order-backlog.repo.ts';
import { makeReviewProductionOrderBacklogRoutes } from './review-production-order-backlog/review-production-order-backlog.route.ts';
import {
  makeCommitProductionOrderBacklog,
  makePreviewProductionOrderBacklog,
} from './review-production-order-backlog/review-production-order-backlog.usecase.ts';
import type { ReviewProductionOrderBacklogRepository } from './review-production-order-backlog/review-production-order-backlog.port.ts';
import { makeReplaceShiftOrderSelection } from './replace-shift-order-selection/replace-shift-order-selection.usecase.ts';
import { makeReplaceShiftOrderSelectionRoute } from './replace-shift-order-selection/replace-shift-order-selection.route.ts';
import { makeReplaceShiftOrderSelectionRepository } from './replace-shift-order-selection/replace-shift-order-selection.repo.ts';
import type { ReplaceShiftOrderSelectionRepository } from './replace-shift-order-selection/replace-shift-order-selection.port.ts';
import { makeRouteProductionOrder } from './route-production-order/route-production-order.usecase.ts';
import { makeRouteProductionOrderRoutes } from './route-production-order/route-production-order.route.ts';
import { makeRouteProductionOrderRepository } from './route-production-order/route-production-order.repo.ts';
import type { RouteProductionOrderRepository } from './route-production-order/route-production-order.port.ts';
import { makeReconcileProductionBatchProgress } from './reconcile-production-batch-progress/reconcile-production-batch-progress.usecase.ts';
import { makeReconcileProductionBatchProgressRoute } from './reconcile-production-batch-progress/reconcile-production-batch-progress.route.ts';
import { makeReconcileProductionBatchProgressRepository } from './reconcile-production-batch-progress/reconcile-production-batch-progress.repo.ts';
import type { ReconcileProductionBatchProgressRepository } from './reconcile-production-batch-progress/reconcile-production-batch-progress.port.ts';
import { makeSetProductionOrderPriority } from './set-production-order-priority/set-production-order-priority.usecase.ts';
import { makeSetProductionOrderPriorityRoute } from './set-production-order-priority/set-production-order-priority.route.ts';
import { makeSetProductionOrderPriorityRepository } from './set-production-order-priority/set-production-order-priority.repo.ts';
import type { SetProductionOrderPriorityRepository } from './set-production-order-priority/set-production-order-priority.port.ts';
import { makeStartSchedule } from './start-schedule/start-schedule.usecase.ts';
import { makeStartScheduleRoute } from './start-schedule/start-schedule.route.ts';
import { makeStartScheduleRepository } from './start-schedule/start-schedule.repo.ts';
import type { StartScheduleRepository } from './start-schedule/start-schedule.port.ts';
import { Router, type RequestHandler, type Response } from 'express';
import type { Database } from '@pressly/db';
import type { ProductionOrderPlacementResult } from '@pressly/contracts';

export type ProductionRepositories = Readonly<{
  acceptSchedule: AcceptScheduleRepository;
  applyFulfillmentDemand: ApplyFulfillmentDemandRepository;
  advanceProductionStage: AdvanceProductionStageRepository;
  assignStageMachines: AssignStageMachinesRepository;
  changeProductionAdmission: ChangeProductionAdmissionRepository;
  changeProductionOrderResolution: ChangeProductionOrderResolutionRepository;
  createSchedule: CreateScheduleRepository;
  listProductionLocations: ListProductionLocationsRepository;
  listProductionOrders: ListProductionOrdersRepository;
  listProductionOrderControl: ListProductionOrderControlRepository;
  productionHistory: ProductionHistoryRepository;
  loadProductionBoard: LoadProductionBoardRepository;
  loadSchedule: LoadScheduleRepository;
  loadProductionWorkspace: LoadProductionWorkspaceRepository;
  manageBatchMembership: ManageBatchMembershipRepository;
  manageProductionResources: ManageProductionResourcesRepository;
  manageProductionShift: ManageProductionShiftRepository;
  placeProductionOrder: PlaceProductionOrderRepository;
  publishSchedulerConfig: PublishSchedulerConfigRepository;
  recordOrderIntake: RecordOrderIntakeRepository;
  reviewProductionOrderBacklog: ReviewProductionOrderBacklogRepository;
  replaceShiftOrderSelection: ReplaceShiftOrderSelectionRepository;
  routeProductionOrder: RouteProductionOrderRepository;
  reconcileProductionBatchProgress: ReconcileProductionBatchProgressRepository;
  setProductionOrderPriority: SetProductionOrderPriorityRepository;
  startSchedule: StartScheduleRepository;
}>;

export type ProductionApplicationDeps = Readonly<{
  repositories: ProductionRepositories;
  policy: ProductionPolicyPort;
  scheduler: ProductionSchedulerPort;
  clock: ClockPort;
  ids: IdPort;
  signals?: ProductionSignalsPort;
}>;

export const makeProductionApplication = (deps: ProductionApplicationDeps) => {
  const signals = deps.signals ?? nullProductionSignals;
  const rawPlaceProductionOrder = makePlaceProductionOrder({
    repo: deps.repositories.placeProductionOrder,
    policy: deps.policy,
    scheduler: deps.scheduler,
    clock: deps.clock,
  });
  const reportPlacement = (
    outcome: ProductionOrderPlacementResult,
    operation: string,
  ): void => {
    if (outcome.replayed) return;
    signals.placementOutcome({
      status: outcome.status,
      mode: outcome.mode,
      ...(outcome.status === 'not_placed' ? { reason: outcome.reason } : {}),
    });
    if (outcome.status === 'not_placed' && outcome.reason === 'queue_conflict')
      signals.queueConflict({ operation });
  };
  const placeProductionOrder: Pick<
    ReturnType<typeof makePlaceProductionOrder>,
    'placeAutomatically' | 'placeExactly' | 'confirmOvertime'
  > = {
    placeAutomatically: async (command) => {
      const outcome = await rawPlaceProductionOrder.placeAutomatically(command);
      if (outcome.tag === 'ok')
        reportPlacement(outcome.value, 'automatic_placement');
      return outcome;
    },
    placeExactly: async (command) => {
      const outcome = await rawPlaceProductionOrder.placeExactly(command);
      if (outcome.tag === 'ok')
        reportPlacement(outcome.value, 'manager_exact_placement');
      return outcome;
    },
    confirmOvertime: async (command) => {
      const outcome = await rawPlaceProductionOrder.confirmOvertime(command);
      if (outcome.tag === 'ok') {
        reportPlacement(outcome.value, 'overtime_confirmation');
        if (outcome.value.status === 'placed' && !outcome.value.replayed)
          signals.overtimeConfirmed();
      }
      return outcome;
    },
  };
  const rawManageBatchMembership = makeManageBatchMembership({
    repo: deps.repositories.manageBatchMembership,
    policy: deps.policy,
    clock: deps.clock,
  });
  const manageBatchMembership: typeof rawManageBatchMembership = async (
    command,
  ) => {
    const outcome = await rawManageBatchMembership(command);
    if (outcome.tag === 'ok') {
      if (command.action === 'freeze' && !outcome.value.replayed)
        signals.batchFrozen({ source: 'explicit' });
    } else if (outcome.error.code === 'production_queue_version_conflict')
      signals.queueConflict({ operation: `${command.action}_membership` });
    return outcome;
  };
  const rawStartSchedule = makeStartSchedule({
    repo: deps.repositories.startSchedule,
    clock: deps.clock,
    policy: deps.policy,
  });
  const startSchedule: typeof rawStartSchedule = async (command) => {
    const outcome = await rawStartSchedule(command);
    if (outcome.tag === 'ok' && !outcome.value.replayed) signals.runStarted();
    return outcome;
  };
  const advanceProductionStage = makeAdvanceProductionStage({
    repo: deps.repositories.advanceProductionStage,
    policy: deps.policy,
    clock: deps.clock,
    signals,
  });
  return {
    applyFulfillmentDemand: makeApplyFulfillmentDemand({
      repo: deps.repositories.applyFulfillmentDemand,
      policy: deps.policy,
      clock: deps.clock,
      ids: deps.ids,
    }),
    publishSchedulerConfig: makePublishSchedulerConfig({
      repo: deps.repositories.publishSchedulerConfig,
      clock: deps.clock,
      ids: deps.ids,
    }),
    createProductionShift: makeCreateProductionShift({
      repo: deps.repositories.manageProductionShift,
      clock: deps.clock,
      ids: deps.ids,
      policy: deps.policy,
    }),
    updateProductionShift: makeUpdateProductionShift({
      repo: deps.repositories.manageProductionShift,
      clock: deps.clock,
      policy: deps.policy,
      signals,
    }),
    setProductionOrderPriority: makeSetProductionOrderPriority({
      repo: deps.repositories.setProductionOrderPriority,
      clock: deps.clock,
      policy: deps.policy,
    }),
    changeProductionAdmission: makeChangeProductionAdmission({
      repo: deps.repositories.changeProductionAdmission,
      policy: deps.policy,
      clock: deps.clock,
    }),
    changeProductionOrderResolution: makeChangeProductionOrderResolution({
      repo: deps.repositories.changeProductionOrderResolution,
      policy: deps.policy,
      clock: deps.clock,
    }),
    createSchedule: makeCreateSchedule({
      repo: deps.repositories.createSchedule,
      scheduler: deps.scheduler,
      policy: deps.policy,
      clock: deps.clock,
      ids: deps.ids,
      signals,
    }),
    listProductionLocations: makeListProductionLocations({
      repo: deps.repositories.listProductionLocations,
      clock: deps.clock,
    }),
    listProductionOrders: makeListProductionOrders({
      repo: deps.repositories.listProductionOrders,
      clock: deps.clock,
    }),
    listProductionOrderControl: makeListProductionOrderControl({
      repo: deps.repositories.listProductionOrderControl,
      clock: deps.clock,
    }),
    productionHistory: makeListProductionHistory({
      repo: deps.repositories.productionHistory,
      clock: deps.clock,
    }),
    loadSchedule: makeLoadSchedule(deps.repositories.loadSchedule),
    acceptSchedule: makeAcceptSchedule({
      repo: deps.repositories.acceptSchedule,
      policy: deps.policy,
      clock: deps.clock,
    }),
    loadProductionBoard: makeLoadProductionBoard({
      repo: deps.repositories.loadProductionBoard,
      policy: deps.policy,
      clock: deps.clock,
    }),
    loadProductionWorkspace: makeLoadProductionWorkspace({
      repo: deps.repositories.loadProductionWorkspace,
      clock: deps.clock,
      policy: deps.policy,
      scheduler: deps.scheduler,
    }),
    manageBatchMembership,
    manageProductionResources: makeManageProductionResources({
      repo: deps.repositories.manageProductionResources,
      clock: deps.clock,
    }),
    placeProductionOrder,
    recordOrderIntake: makeRecordOrderIntake({
      repo: deps.repositories.recordOrderIntake,
      policy: deps.policy,
      clock: deps.clock,
    }),
    previewProductionOrderBacklog: makePreviewProductionOrderBacklog({
      repo: deps.repositories.reviewProductionOrderBacklog,
      policy: deps.policy,
      clock: deps.clock,
    }),
    commitProductionOrderBacklog: makeCommitProductionOrderBacklog({
      repo: deps.repositories.reviewProductionOrderBacklog,
      policy: deps.policy,
      clock: deps.clock,
      ids: deps.ids,
    }),
    replaceShiftOrderSelection: makeReplaceShiftOrderSelection({
      repo: deps.repositories.replaceShiftOrderSelection,
      clock: deps.clock,
      policy: deps.policy,
      signals,
    }),
    routeProductionOrder: makeRouteProductionOrder({
      repo: deps.repositories.routeProductionOrder,
      policy: deps.policy,
      clock: deps.clock,
      signals,
    }),
    reconcileProductionBatchProgress: makeReconcileProductionBatchProgress({
      repo: deps.repositories.reconcileProductionBatchProgress,
      policy: deps.policy,
      clock: deps.clock,
      signals,
    }),
    startSchedule,
    assignStageMachines: makeAssignStageMachines({
      repo: deps.repositories.assignStageMachines,
      policy: deps.policy,
      clock: deps.clock,
    }),
    advanceProductionStage,
  };
};

export type ProductionApplication = ReturnType<
  typeof makeProductionApplication
>;

export type ProductionHttpApplication = ProductionApplication &
  Readonly<{ loadRemainingDayForecast: LoadRemainingDayForecast }>;

export type ProductionRouteSecurity = Readonly<{
  authenticate: RequestHandler;
  read: RequestHandler;
  schedule: RequestHandler;
  accept: RequestHandler;
  start: RequestHandler;
  queue: RequestHandler;
  override: RequestHandler;
  priority: RequestHandler;
  intake: RequestHandler;
  admission: RequestHandler;
  resources: RequestHandler;
  stage: RequestHandler;
  readActorId: (response: Response) => string;
  readAllowedLocationIds: (response: Response) => readonly string[] | null;
}>;

export const makeProductionRoutes = (input: {
  application: ProductionHttpApplication;
  security: ProductionRouteSecurity;
}): Router => {
  const routes = Router();
  const actor = { readActorId: input.security.readActorId };
  const scheduleSecurity = {
    authenticate: input.security.authenticate,
    authorize: input.security.schedule,
  };

  routes.use(
    makeListProductionLocationsRoute({
      listLocations: input.application.listProductionLocations,
      authenticate: input.security.authenticate,
      readAllowedLocationIds: input.security.readAllowedLocationIds,
    }),
  );
  routes.use(
    makeListProductionOrdersRoute({
      listOrders: input.application.listProductionOrders,
      authenticate: input.security.authenticate,
      authorize: input.security.read,
    }),
  );
  routes.use(
    makeListProductionOrderControlRoute({
      list: input.application.listProductionOrderControl,
      authenticate: input.security.authenticate,
      authorize: input.security.read,
    }),
  );
  routes.use(
    makeListProductionHistoryRoute({
      history: input.application.productionHistory,
      authenticate: input.security.authenticate,
      authorize: input.security.read,
    }),
  );
  routes.use(
    makeLoadProductionWorkspaceRoute({
      loadWorkspace: input.application.loadProductionWorkspace,
      authenticate: input.security.authenticate,
      authorize: input.security.read,
    }),
  );
  routes.use(
    makeLoadRemainingDayForecastRoute({
      loadForecast: input.application.loadRemainingDayForecast,
      authenticate: input.security.authenticate,
      authorize: input.security.read,
    }),
  );
  routes.use(
    makePublishSchedulerConfigRoute({
      publish: input.application.publishSchedulerConfig,
      ...scheduleSecurity,
      ...actor,
    }),
  );
  routes.use(
    makeCreateProductionShiftRoute({
      create: input.application.createProductionShift,
      ...scheduleSecurity,
      ...actor,
    }),
  );
  routes.use(
    makeUpdateProductionShiftRoute({
      update: input.application.updateProductionShift,
      ...scheduleSecurity,
      ...actor,
    }),
  );
  routes.use(
    makeSetProductionOrderPriorityRoute({
      setPriority: input.application.setProductionOrderPriority,
      authenticate: input.security.authenticate,
      authorize: input.security.priority,
      ...actor,
    }),
  );
  routes.use(
    makeRecordOrderIntakeRoute({
      recordIntake: input.application.recordOrderIntake,
      authenticate: input.security.authenticate,
      authorize: input.security.intake,
      ...actor,
    }),
  );
  routes.use(
    makeChangeProductionAdmissionRoute({
      changeAdmission: input.application.changeProductionAdmission,
      authenticate: input.security.authenticate,
      authorize: input.security.admission,
      ...actor,
    }),
  );
  routes.use(
    makeChangeProductionOrderResolutionRoute({
      changeResolution: input.application.changeProductionOrderResolution,
      authenticate: input.security.authenticate,
      authorize: input.security.override,
      ...actor,
    }),
  );
  routes.use(
    makeReviewProductionOrderBacklogRoutes({
      preview: input.application.previewProductionOrderBacklog,
      commit: input.application.commitProductionOrderBacklog,
      authenticate: input.security.authenticate,
      authorize: input.security.override,
      ...actor,
    }),
  );
  routes.use(
    makeReplaceShiftOrderSelectionRoute({
      replace: input.application.replaceShiftOrderSelection,
      ...scheduleSecurity,
      ...actor,
    }),
  );
  routes.use(
    makeCreateScheduleRoute({
      createSchedule: input.application.createSchedule,
      ...scheduleSecurity,
      ...actor,
    }),
  );
  routes.use(
    makeLoadScheduleRoute({
      loadSchedule: input.application.loadSchedule,
      authenticate: input.security.authenticate,
      authorize: input.security.read,
    }),
  );
  routes.use(
    makeAcceptScheduleRoute({
      acceptSchedule: input.application.acceptSchedule,
      authenticate: input.security.authenticate,
      authorize: input.security.accept,
      ...actor,
    }),
  );
  routes.use(
    makeLoadProductionBoardRoute({
      loadBoard: input.application.loadProductionBoard,
      authenticate: input.security.authenticate,
      authorize: input.security.read,
    }),
  );
  routes.use(
    makeStartScheduleRoute({
      startSchedule: input.application.startSchedule,
      authenticate: input.security.authenticate,
      authorize: input.security.start,
      ...actor,
    }),
  );
  routes.use(
    makeManageBatchMembershipRoute({
      manage: input.application.manageBatchMembership,
      authenticate: input.security.authenticate,
      authorizeFreeze: input.security.queue,
      authorizeUnfreeze: input.security.override,
      ...actor,
    }),
  );
  routes.use(
    makePlaceProductionOrderRoutes({
      ...input.application.placeProductionOrder,
      authenticate: input.security.authenticate,
      authorizeOverride: input.security.override,
      ...actor,
    }),
  );
  routes.use(
    makeRouteProductionOrderRoutes({
      ...input.application.routeProductionOrder,
      authenticate: input.security.authenticate,
      authorize: input.security.stage,
      ...actor,
    }),
  );
  routes.use(
    makeAssignStageMachinesRoute({
      assign: input.application.assignStageMachines,
      authenticate: input.security.authenticate,
      authorize: input.security.stage,
      ...actor,
    }),
  );
  routes.use(
    makeReconcileProductionBatchProgressRoute({
      reconcile: input.application.reconcileProductionBatchProgress,
      authenticate: input.security.authenticate,
      authorize: input.security.stage,
      ...actor,
    }),
  );
  routes.use(
    makeAdvanceProductionStageRoute({
      advance: input.application.advanceProductionStage,
      authenticate: input.security.authenticate,
      authorize: input.security.stage,
      ...actor,
    }),
  );

  return routes;
};

type PostgresProductionApplicationDeps = Omit<
  ProductionApplicationDeps,
  'repositories' | 'scheduler'
> & {
  db: Database;
  scheduler: ProductionApplicationSchedulerPort;
};

export const makePostgresProductionApplication = (
  deps: PostgresProductionApplicationDeps,
): ProductionHttpApplication => {
  const application = makeProductionApplication({
    ...deps,
    repositories: {
      acceptSchedule: makeAcceptScheduleRepository(deps),
      applyFulfillmentDemand: makeApplyFulfillmentDemandRepository(deps),
      advanceProductionStage: makeAdvanceProductionStageRepository(deps),
      assignStageMachines: makeAssignStageMachinesRepository(deps),
      changeProductionAdmission: makeChangeProductionAdmissionRepository(deps),
      changeProductionOrderResolution:
        makeChangeProductionOrderResolutionRepository(deps),
      createSchedule: makeCreateScheduleRepository(deps),
      listProductionLocations: makeListProductionLocationsRepository(deps.db),
      listProductionOrders: makeListProductionOrdersRepository(deps.db),
      listProductionOrderControl: makeListProductionOrderControlRepository({
        db: deps.db,
        policy: deps.policy,
      }),
      productionHistory: makeListProductionHistoryRepository(deps.db),
      loadProductionBoard: makeLoadProductionBoardRepository(deps),
      loadSchedule: makeLoadScheduleRepository(deps.db),
      loadProductionWorkspace: makeLoadProductionWorkspaceRepository(deps.db),
      manageBatchMembership: makeManageBatchMembershipRepository(deps),
      manageProductionResources: makeManageProductionResourcesRepository(deps),
      manageProductionShift: makeManageProductionShiftRepository(deps),
      placeProductionOrder: makePlaceProductionOrderRepository(deps),
      publishSchedulerConfig: makePublishSchedulerConfigRepository(deps),
      recordOrderIntake: makeRecordOrderIntakeRepository(deps),
      reviewProductionOrderBacklog:
        makeReviewProductionOrderBacklogRepository(deps),
      replaceShiftOrderSelection:
        makeReplaceShiftOrderSelectionRepository(deps),
      routeProductionOrder: makeRouteProductionOrderRepository(deps),
      reconcileProductionBatchProgress:
        makeReconcileProductionBatchProgressRepository(deps),
      setProductionOrderPriority:
        makeSetProductionOrderPriorityRepository(deps),
      startSchedule: makeStartScheduleRepository(deps),
    },
  });
  return {
    ...application,
    loadRemainingDayForecast: makeLoadRemainingDayForecast({
      repo: makeLoadRemainingDayForecastRepository(deps.db),
      clock: deps.clock,
      policy: deps.policy,
      project: deps.scheduler.projectRemainingDayForecast,
    }),
  };
};

export const makePostgresProductionModule = (
  deps: PostgresProductionApplicationDeps & {
    security: ProductionRouteSecurity;
  },
): Readonly<{ application: ProductionHttpApplication; routes: Router }> => {
  const application = makePostgresProductionApplication(deps);
  return {
    application,
    routes: makeProductionRoutes({ application, security: deps.security }),
  };
};
