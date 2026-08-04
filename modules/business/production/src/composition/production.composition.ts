import { makeAcceptSchedule } from '../features/scheduling/accept-schedule/accept-schedule.usecase.ts';
import { makeAcceptScheduleRoute } from '../features/scheduling/accept-schedule/accept-schedule.route.ts';
import { makeAcceptScheduleRepository } from '../features/scheduling/accept-schedule/accept-schedule.repo.ts';
import type { IdSource } from '@pressly/kernel';
import type { AcceptScheduleRepository } from '../features/scheduling/accept-schedule/accept-schedule.port.ts';
import { makeApplyFulfillmentDemandRepository } from '../features/demand/apply-fulfillment-demand/apply-fulfillment-demand.repo.ts';
import { makeApplyFulfillmentDemand } from '../features/demand/apply-fulfillment-demand/apply-fulfillment-demand.usecase.ts';
import type { ApplyFulfillmentDemandRepository } from '../features/demand/apply-fulfillment-demand/apply-fulfillment-demand.port.ts';
import { makeAdvanceProductionStage } from '../features/floor/advance-stage/advance-production-stage.usecase.ts';
import { makeAdvanceProductionStageRoute } from '../features/floor/advance-stage/advance-production-stage.route.ts';
import { makeAdvanceProductionStageRepository } from '../features/floor/advance-stage/advance-production-stage.repo.ts';
import type { AdvanceProductionStageRepository } from '../features/floor/advance-stage/advance-production-stage.port.ts';
import { makeAssignStageMachines } from '../features/floor/assign-stage-machines/assign-stage-machines.usecase.ts';
import { makeAssignStageMachinesRoute } from '../features/floor/assign-stage-machines/assign-stage-machines.route.ts';
import { makeAssignStageMachinesRepository } from '../features/floor/assign-stage-machines/assign-stage-machines.repo.ts';
import type { AssignStageMachinesRepository } from '../features/floor/assign-stage-machines/assign-stage-machines.port.ts';
import { makeChangeProductionAdmission } from '../features/demand/change-admission/change-production-admission.usecase.ts';
import { makeChangeProductionAdmissionRoute } from '../features/demand/change-admission/change-production-admission.route.ts';
import { makeChangeProductionAdmissionRepository } from '../features/demand/change-admission/change-production-admission.repo.ts';
import type { ChangeProductionAdmissionRepository } from '../features/demand/change-admission/change-production-admission.port.ts';
import { makeChangeProductionOrderResolution } from '../features/demand/change-order-resolution/change-production-order-resolution.usecase.ts';
import { makeChangeProductionOrderResolutionRoute } from '../features/demand/change-order-resolution/change-production-order-resolution.route.ts';
import { makeChangeProductionOrderResolutionRepository } from '../features/demand/change-order-resolution/change-production-order-resolution.repo.ts';
import type { ChangeProductionOrderResolutionRepository } from '../features/demand/change-order-resolution/change-production-order-resolution.port.ts';
import { makeResolveSourceClosedFulfillment } from '../features/demand/resolve-source-closed-fulfillment/resolve-source-closed-fulfillment.usecase.ts';
import { makeResolveSourceClosedFulfillmentRepository } from '../features/demand/resolve-source-closed-fulfillment/resolve-source-closed-fulfillment.repo.ts';
import type { ResolveSourceClosedFulfillmentRepository } from '../features/demand/resolve-source-closed-fulfillment/resolve-source-closed-fulfillment.port.ts';
import { makeCreateSchedule } from '../features/scheduling/create-schedule/create-schedule.usecase.ts';
import { makeCreateScheduleRoute } from '../features/scheduling/create-schedule/create-schedule.route.ts';
import { makeCreateScheduleRepository } from '../features/scheduling/create-schedule/create-schedule.repo.ts';
import type { CreateScheduleRepository } from '../features/scheduling/create-schedule/create-schedule.port.ts';
import { makeListProductionLocations } from '../features/resources/list-locations/list-production-locations.usecase.ts';
import { makeListProductionLocationsRoute } from '../features/resources/list-locations/list-production-locations.route.ts';
import { makeListProductionLocationsRepository } from '../features/resources/list-locations/list-production-locations.repo.ts';
import type { ListProductionLocationsRepository } from '../features/resources/list-locations/list-production-locations.port.ts';
import { makeListProductionOrders } from '../features/orders/list-orders/list-production-orders.usecase.ts';
import { makeListProductionOrdersRoute } from '../features/orders/list-orders/list-production-orders.route.ts';
import { makeListProductionOrdersRepository } from '../features/orders/list-orders/list-production-orders.repo.ts';
import type { ListProductionOrdersRepository } from '../features/orders/list-orders/list-production-orders.port.ts';
import { makeListProductionOrderControl } from '../features/orders/list-order-control/list-production-order-control.usecase.ts';
import { makeListProductionOrderControlRoute } from '../features/orders/list-order-control/list-production-order-control.route.ts';
import { makeListProductionOrderControlRepository } from '../features/orders/list-order-control/list-production-order-control.repo.ts';
import type { ListProductionOrderControlRepository } from '../features/orders/list-order-control/list-production-order-control.port.ts';
import { makeListProductionHistoryActivityRepository } from '../features/history/list-activity/list-production-history-activity.repo.ts';
import { makeListProductionHistoryActivityRoute } from '../features/history/list-activity/list-production-history-activity.route.ts';
import { makeListProductionHistoryActivity } from '../features/history/list-activity/list-production-history-activity.usecase.ts';
import type { ListProductionHistoryActivityRepository } from '../features/history/list-activity/list-production-history-activity.port.ts';
import { makeListProductionHistoryPlansRepository } from '../features/history/list-plans/list-production-history-plans.repo.ts';
import { makeListProductionHistoryPlansRoute } from '../features/history/list-plans/list-production-history-plans.route.ts';
import { makeListProductionHistoryPlans } from '../features/history/list-plans/list-production-history-plans.usecase.ts';
import type { ListProductionHistoryPlansRepository } from '../features/history/list-plans/list-production-history-plans.port.ts';
import { makeListProductionHistoryRunsRepository } from '../features/history/list-runs/list-production-history-runs.repo.ts';
import { makeListProductionHistoryRunsRoute } from '../features/history/list-runs/list-production-history-runs.route.ts';
import { makeListProductionHistoryRuns } from '../features/history/list-runs/list-production-history-runs.usecase.ts';
import type { ListProductionHistoryRunsRepository } from '../features/history/list-runs/list-production-history-runs.port.ts';
import { makeLoadProductionHistoryRunRepository } from '../features/history/load-run/load-production-history-run.repo.ts';
import { makeLoadProductionHistoryRunRoute } from '../features/history/load-run/load-production-history-run.route.ts';
import { makeLoadProductionHistoryRun } from '../features/history/load-run/load-production-history-run.usecase.ts';
import type { LoadProductionHistoryRunRepository } from '../features/history/load-run/load-production-history-run.port.ts';
import { makeLoadProductionBoard } from '../features/queries/load-board/load-production-board.usecase.ts';
import { makeLoadProductionBoardRoute } from '../features/queries/load-board/load-production-board.route.ts';
import { makeLoadProductionBoardRepository } from '../features/queries/load-board/load-production-board.repo.ts';
import type { LoadProductionBoardRepository } from '../features/queries/load-board/load-production-board.port.ts';
import { makeLoadSchedule } from '../features/scheduling/load-schedule/load-schedule.usecase.ts';
import { makeLoadScheduleRoute } from '../features/scheduling/load-schedule/load-schedule.route.ts';
import { makeLoadScheduleRepository } from '../features/scheduling/load-schedule/load-schedule.repo.ts';
import type { LoadScheduleRepository } from '../features/scheduling/load-schedule/load-schedule.port.ts';
import { makeLoadProductionWorkspace } from '../features/queries/load-workspace/load-production-workspace.usecase.ts';
import { makeLoadProductionWorkspaceRoute } from '../features/queries/load-workspace/load-production-workspace.route.ts';
import { makeLoadProductionWorkspaceRepository } from '../features/queries/load-workspace/load-production-workspace.repo.ts';
import type { LoadProductionWorkspaceRepository } from '../features/queries/load-workspace/load-production-workspace.port.ts';
import { makeLoadRemainingDayForecast } from '../features/queries/load-remaining-day-forecast/load-remaining-day-forecast.usecase.ts';
import { makeLoadRemainingDayForecastRoute } from '../features/queries/load-remaining-day-forecast/load-remaining-day-forecast.route.ts';
import { makeLoadRemainingDayForecastRepository } from '../features/queries/load-remaining-day-forecast/load-remaining-day-forecast.repo.ts';
import type { LoadRemainingDayForecast } from '../features/queries/load-remaining-day-forecast/load-remaining-day-forecast.port.ts';
import { makeManageBatchMembership } from '../features/floor/manage-batch-membership/manage-batch-membership.usecase.ts';
import { makeManageBatchMembershipRoute } from '../features/floor/manage-batch-membership/manage-batch-membership.route.ts';
import { makeManageBatchMembershipRepository } from '../features/floor/manage-batch-membership/manage-batch-membership.repo.ts';
import type { ManageBatchMembershipRepository } from '../features/floor/manage-batch-membership/manage-batch-membership.port.ts';
import { makeManageProductionResources } from '../features/resources/manage-resources/manage-production-resources.usecase.ts';
import { makeManageProductionResourcesRepository } from '../features/resources/manage-resources/manage-production-resources.repo.ts';
import type { ManageProductionResourcesRepository } from '../features/resources/manage-resources/manage-production-resources.port.ts';
import {
  makeCreateProductionShift,
  makeUpdateProductionShift,
} from '../features/resources/manage-shift/manage-production-shift.usecase.ts';
import {
  makeCreateProductionShiftRoute,
  makeUpdateProductionShiftRoute,
} from '../features/resources/manage-shift/manage-production-shift.route.ts';
import { makeManageProductionShiftRepository } from '../features/resources/manage-shift/manage-production-shift.repo.ts';
import type { ManageProductionShiftRepository } from '../features/resources/manage-shift/manage-production-shift.port.ts';
import { makePlaceProductionOrder } from '../features/scheduling/place-order/place-production-order.usecase.ts';
import { makePlaceProductionOrderRoutes } from '../features/scheduling/place-order/place-production-order.route.ts';
import { makePlaceProductionOrderRepository } from '../features/scheduling/place-order/place-production-order.repo.ts';
import type { PlaceProductionOrderRepository } from '../features/scheduling/place-order/place-production-order.port.ts';
import type { Clock } from '@pressly/time';
import { productionRules } from '../foundations/language/rules/production-rules.factory.ts';
import { productionAlgorithms } from '../foundations/algorithms/approved-production/production-algorithms.algorithm.ts';
import type { ProductionSignalsPort } from '../foundations/ports/signals/production-signals.port.ts';
import { nullProductionSignals } from '../foundations/adapters/signals/null-production-signals.adapter.ts';
import { makePublishSchedulerConfig } from '../features/scheduling/publish-config/publish-scheduler-config.usecase.ts';
import { makePublishSchedulerConfigRoute } from '../features/scheduling/publish-config/publish-scheduler-config.route.ts';
import { makePublishSchedulerConfigRepository } from '../features/scheduling/publish-config/publish-scheduler-config.repo.ts';
import type { PublishSchedulerConfigRepository } from '../features/scheduling/publish-config/publish-scheduler-config.port.ts';
import { makeRecordOrderIntake } from '../features/demand/record-order-intake/record-order-intake.usecase.ts';
import { makeRecordOrderIntakeRoute } from '../features/demand/record-order-intake/record-order-intake.route.ts';
import { makeRecordOrderIntakeRepository } from '../features/demand/record-order-intake/record-order-intake.repo.ts';
import type { RecordOrderIntakeRepository } from '../features/demand/record-order-intake/record-order-intake.port.ts';
import { makeReviewProductionOrderBacklogRepository } from '../features/demand/review-order-backlog/review-production-order-backlog.repo.ts';
import { makeReviewProductionOrderBacklogRoutes } from '../features/demand/review-order-backlog/review-production-order-backlog.route.ts';
import {
  makeCommitProductionOrderBacklog,
  makePreviewProductionOrderBacklog,
} from '../features/demand/review-order-backlog/review-production-order-backlog.usecase.ts';
import type { ReviewProductionOrderBacklogRepository } from '../features/demand/review-order-backlog/review-production-order-backlog.port.ts';
import { makeReplaceShiftOrderSelection } from '../features/scheduling/replace-shift-selection/replace-shift-order-selection.usecase.ts';
import { makeReplaceShiftOrderSelectionRoute } from '../features/scheduling/replace-shift-selection/replace-shift-order-selection.route.ts';
import { makeReplaceShiftOrderSelectionRepository } from '../features/scheduling/replace-shift-selection/replace-shift-order-selection.repo.ts';
import type { ReplaceShiftOrderSelectionRepository } from '../features/scheduling/replace-shift-selection/replace-shift-order-selection.port.ts';
import { makeRouteProductionOrder } from '../features/orders/route-order/route-production-order.usecase.ts';
import { makeRouteProductionOrderRoutes } from '../features/orders/route-order/route-production-order.route.ts';
import { makeRouteProductionOrderRepository } from '../features/orders/route-order/route-production-order.repo.ts';
import type { RouteProductionOrderRepository } from '../features/orders/route-order/route-production-order.port.ts';
import { makeReconcileProductionBatchProgress } from '../features/floor/reconcile-batch-progress/reconcile-production-batch-progress.usecase.ts';
import { makeReconcileProductionBatchProgressRoute } from '../features/floor/reconcile-batch-progress/reconcile-production-batch-progress.route.ts';
import { makeReconcileProductionBatchProgressRepository } from '../features/floor/reconcile-batch-progress/reconcile-production-batch-progress.repo.ts';
import type { ReconcileProductionBatchProgressRepository } from '../features/floor/reconcile-batch-progress/reconcile-production-batch-progress.port.ts';
import { makeSetProductionOrderPriority } from '../features/demand/set-order-priority/set-production-order-priority.usecase.ts';
import { makeSetProductionOrderPriorityRoute } from '../features/demand/set-order-priority/set-production-order-priority.route.ts';
import { makeSetProductionOrderPriorityRepository } from '../features/demand/set-order-priority/set-production-order-priority.repo.ts';
import type { SetProductionOrderPriorityRepository } from '../features/demand/set-order-priority/set-production-order-priority.port.ts';
import { makeStartSchedule } from '../features/scheduling/start-schedule/start-schedule.usecase.ts';
import { makeStartScheduleRoute } from '../features/scheduling/start-schedule/start-schedule.route.ts';
import { makeStartScheduleRepository } from '../features/scheduling/start-schedule/start-schedule.repo.ts';
import type { StartScheduleRepository } from '../features/scheduling/start-schedule/start-schedule.port.ts';
import { Router, type RequestHandler, type Response } from 'express';
import type { Database } from '@pressly/db/client';

type ProductionHistoryRepository = Readonly<{
  listRuns: ListProductionHistoryRunsRepository['list'];
  listActivity: ListProductionHistoryActivityRepository['list'];
  listPlans: ListProductionHistoryPlansRepository['list'];
  loadRun: LoadProductionHistoryRunRepository['load'];
}>;

export type ProductionRepositories = Readonly<{
  acceptSchedule: AcceptScheduleRepository;
  applyFulfillmentDemand: ApplyFulfillmentDemandRepository;
  advanceProductionStage: AdvanceProductionStageRepository;
  assignStageMachines: AssignStageMachinesRepository;
  changeProductionAdmission: ChangeProductionAdmissionRepository;
  changeProductionOrderResolution: ChangeProductionOrderResolutionRepository;
  resolveSourceClosedFulfillment: ResolveSourceClosedFulfillmentRepository;
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
  clock: Clock;
  ids: IdSource;
  signals?: ProductionSignalsPort;
}>;

export const makeProductionApplication = (deps: ProductionApplicationDeps) => {
  const signals = deps.signals ?? nullProductionSignals;

  const placeProductionOrder = makePlaceProductionOrder({
    repo: deps.repositories.placeProductionOrder,
    policy: productionRules,
    scheduler: productionAlgorithms,
    clock: deps.clock,
    signals,
  });
  const manageBatchMembership = makeManageBatchMembership({
    repo: deps.repositories.manageBatchMembership,
    policy: productionRules,
    clock: deps.clock,
    signals,
  });
  const startSchedule = makeStartSchedule({
    repo: deps.repositories.startSchedule,
    clock: deps.clock,
    policy: productionRules,
    signals,
  });

  const advanceProductionStage = makeAdvanceProductionStage({
    repo: deps.repositories.advanceProductionStage,
    policy: productionRules,
    clock: deps.clock,
    signals,
  });

  const changeProductionOrderResolution = makeChangeProductionOrderResolution({
    repo: deps.repositories.changeProductionOrderResolution,
    policy: productionRules,
    clock: deps.clock,
  });

  return {
    applyFulfillmentDemand: makeApplyFulfillmentDemand({
      repo: deps.repositories.applyFulfillmentDemand,
      policy: productionRules,
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
      policy: productionRules,
    }),
    updateProductionShift: makeUpdateProductionShift({
      repo: deps.repositories.manageProductionShift,
      clock: deps.clock,
      policy: productionRules,
      signals,
    }),
    setProductionOrderPriority: makeSetProductionOrderPriority({
      repo: deps.repositories.setProductionOrderPriority,
      clock: deps.clock,
      policy: productionRules,
    }),
    changeProductionAdmission: makeChangeProductionAdmission({
      repo: deps.repositories.changeProductionAdmission,
      policy: productionRules,
      clock: deps.clock,
    }),
    changeProductionOrderResolution,
    resolveSourceClosedFulfillment: makeResolveSourceClosedFulfillment({
      repo: deps.repositories.resolveSourceClosedFulfillment,
      resolveProductionOrder: changeProductionOrderResolution,
    }),
    createSchedule: makeCreateSchedule({
      repo: deps.repositories.createSchedule,
      scheduler: productionAlgorithms,
      policy: productionRules,
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
    productionHistory: {
      listRuns: makeListProductionHistoryRuns({
        repo: { list: deps.repositories.productionHistory.listRuns },
        clock: deps.clock,
      }),
      listActivity: makeListProductionHistoryActivity({
        repo: { list: deps.repositories.productionHistory.listActivity },
        clock: deps.clock,
      }),
      listPlans: makeListProductionHistoryPlans({
        repo: { list: deps.repositories.productionHistory.listPlans },
        clock: deps.clock,
      }),
      loadRun: makeLoadProductionHistoryRun({
        repo: { load: deps.repositories.productionHistory.loadRun },
        clock: deps.clock,
      }),
    },
    loadSchedule: makeLoadSchedule(deps.repositories.loadSchedule),
    acceptSchedule: makeAcceptSchedule({
      repo: deps.repositories.acceptSchedule,
      policy: productionRules,
      clock: deps.clock,
    }),
    loadProductionBoard: makeLoadProductionBoard({
      repo: deps.repositories.loadProductionBoard,
      policy: productionRules,
      clock: deps.clock,
    }),
    loadProductionWorkspace: makeLoadProductionWorkspace({
      repo: deps.repositories.loadProductionWorkspace,
      clock: deps.clock,
      policy: productionRules,
      scheduler: productionAlgorithms,
    }),
    manageBatchMembership,
    manageProductionResources: makeManageProductionResources({
      repo: deps.repositories.manageProductionResources,
      clock: deps.clock,
    }),
    placeProductionOrder,
    recordOrderIntake: makeRecordOrderIntake({
      repo: deps.repositories.recordOrderIntake,
      policy: productionRules,
      clock: deps.clock,
    }),
    previewProductionOrderBacklog: makePreviewProductionOrderBacklog({
      repo: deps.repositories.reviewProductionOrderBacklog,
      policy: productionRules,
      clock: deps.clock,
    }),
    commitProductionOrderBacklog: makeCommitProductionOrderBacklog({
      repo: deps.repositories.reviewProductionOrderBacklog,
      policy: productionRules,
      clock: deps.clock,
      ids: deps.ids,
    }),
    replaceShiftOrderSelection: makeReplaceShiftOrderSelection({
      repo: deps.repositories.replaceShiftOrderSelection,
      clock: deps.clock,
      policy: productionRules,
      signals,
    }),
    routeProductionOrder: makeRouteProductionOrder({
      repo: deps.repositories.routeProductionOrder,
      policy: productionRules,
      clock: deps.clock,
      signals,
    }),
    reconcileProductionBatchProgress: makeReconcileProductionBatchProgress({
      repo: deps.repositories.reconcileProductionBatchProgress,
      policy: productionRules,
      clock: deps.clock,
      signals,
    }),
    startSchedule,
    assignStageMachines: makeAssignStageMachines({
      repo: deps.repositories.assignStageMachines,
      policy: productionRules,
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
  readAllowedLocationIds: (
    response: Response,
  ) => Promise<readonly string[] | null>;
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
    makeListProductionHistoryRunsRoute({
      listRuns: (command) =>
        input.application.productionHistory.listRuns(command),
      authenticate: input.security.authenticate,
      authorize: input.security.read,
    }),
  );
  routes.use(
    makeLoadProductionHistoryRunRoute({
      loadRun: (command) =>
        input.application.productionHistory.loadRun(command),
      authenticate: input.security.authenticate,
      authorize: input.security.read,
    }),
  );
  routes.use(
    makeListProductionHistoryActivityRoute({
      listActivity: (command) =>
        input.application.productionHistory.listActivity(command),
      authenticate: input.security.authenticate,
      authorize: input.security.read,
    }),
  );
  routes.use(
    makeListProductionHistoryPlansRoute({
      listPlans: (command) =>
        input.application.productionHistory.listPlans(command),
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
  'repositories'
> &
  Readonly<{ db: Database }>;

export const makePostgresProductionApplication = (
  deps: PostgresProductionApplicationDeps,
): ProductionHttpApplication => {
  const productionHistoryRuns = makeListProductionHistoryRunsRepository(
    deps.db,
  );
  const productionHistoryActivity = makeListProductionHistoryActivityRepository(
    deps.db,
  );
  const productionHistoryPlans = makeListProductionHistoryPlansRepository(
    deps.db,
  );
  const productionHistoryRun = makeLoadProductionHistoryRunRepository(deps.db);
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
      resolveSourceClosedFulfillment:
        makeResolveSourceClosedFulfillmentRepository(deps.db),
      createSchedule: makeCreateScheduleRepository(deps),
      listProductionLocations: makeListProductionLocationsRepository(deps.db),
      listProductionOrders: makeListProductionOrdersRepository(deps.db),
      listProductionOrderControl: makeListProductionOrderControlRepository({
        db: deps.db,
        policy: productionRules,
      }),
      productionHistory: {
        listRuns: productionHistoryRuns.list,
        listActivity: productionHistoryActivity.list,
        listPlans: productionHistoryPlans.list,
        loadRun: productionHistoryRun.load,
      },
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
      policy: productionRules,
      project: productionAlgorithms.projectRemainingDayForecast,
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

export { productionFailureToAppError } from '../foundations/adapters/errors/production-failure.adapter.ts';
export type { ProductionFeatureFailure } from '../foundations/language/failures/production-feature.failure.ts';
