import { makeAcceptSchedule } from './accept-schedule/accept-schedule.usecase.ts';
import { makeAcceptScheduleRoute } from './accept-schedule/accept-schedule.route.ts';
import { makeAcceptScheduleRepository } from './accept-schedule/accept-schedule.repo.ts';
import type { AcceptScheduleRepository } from './accept-schedule/accept-schedule.port.ts';
import { makeApplyOrderDemandRepository } from './apply-order-demand/apply-order-demand.repo.ts';
import { makeApplyOrderDemand } from './apply-order-demand/apply-order-demand.usecase.ts';
import type { ApplyOrderDemandRepository } from './apply-order-demand/apply-order-demand.port.ts';
import { makeAdvanceProductionStage } from './advance-production-stage/advance-production-stage.usecase.ts';
import { makeAdvanceProductionStageRoute } from './advance-production-stage/advance-production-stage.route.ts';
import { makeAdvanceProductionStageRepository } from './advance-production-stage/advance-production-stage.repo.ts';
import type { AdvanceProductionStageRepository } from './advance-production-stage/advance-production-stage.port.ts';
import { makeAssignStageMachines } from './assign-stage-machines/assign-stage-machines.usecase.ts';
import { makeAssignStageMachinesRoute } from './assign-stage-machines/assign-stage-machines.route.ts';
import { makeAssignStageMachinesRepository } from './assign-stage-machines/assign-stage-machines.repo.ts';
import type { AssignStageMachinesRepository } from './assign-stage-machines/assign-stage-machines.port.ts';
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
import { automaticPlacementIdempotencyKey } from './automatic-placement-idempotency.policy.ts';

export type ProductionRepositories = Readonly<{
  acceptSchedule: AcceptScheduleRepository;
  applyOrderDemand: ApplyOrderDemandRepository;
  advanceProductionStage: AdvanceProductionStageRepository;
  assignStageMachines: AssignStageMachinesRepository;
  createSchedule: CreateScheduleRepository;
  listProductionLocations: ListProductionLocationsRepository;
  listProductionOrders: ListProductionOrdersRepository;
  loadProductionBoard: LoadProductionBoardRepository;
  loadSchedule: LoadScheduleRepository;
  loadProductionWorkspace: LoadProductionWorkspaceRepository;
  manageBatchMembership: ManageBatchMembershipRepository;
  manageProductionResources: ManageProductionResourcesRepository;
  manageProductionShift: ManageProductionShiftRepository;
  placeProductionOrder: PlaceProductionOrderRepository;
  publishSchedulerConfig: PublishSchedulerConfigRepository;
  recordOrderIntake: RecordOrderIntakeRepository;
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
  const attemptAutomaticPlacement = async (input: {
    locationId: string;
    productionOrderId: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<void> => {
    const outcome = await rawPlaceProductionOrder.attemptAutomaticPlacement({
      locationId: input.locationId,
      productionOrderId: input.productionOrderId,
      idempotencyKey: automaticPlacementIdempotencyKey(input.idempotencyKey),
      actorId: input.actorId,
      actorRole: 'operator',
    });
    if (outcome.tag === 'ok' && outcome.value !== null)
      reportPlacement(outcome.value, 'automatic_placement');
  };

  return {
    applyOrderDemand: makeApplyOrderDemand({
      repo: deps.repositories.applyOrderDemand,
      policy: deps.policy,
      clock: deps.clock,
      ids: deps.ids,
      attemptAutomaticPlacement,
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
    }),
    updateProductionShift: makeUpdateProductionShift({
      repo: deps.repositories.manageProductionShift,
      clock: deps.clock,
      signals,
    }),
    setProductionOrderPriority: makeSetProductionOrderPriority({
      repo: deps.repositories.setProductionOrderPriority,
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
      attemptAutomaticPlacement,
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
  resources: RequestHandler;
  stage: RequestHandler;
  readActorId: (response: Response) => string;
  readAllowedLocationIds: (response: Response) => readonly string[] | null;
}>;

export const makeProductionRoutes = (input: {
  application: ProductionApplication;
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
    makeLoadProductionWorkspaceRoute({
      loadWorkspace: input.application.loadProductionWorkspace,
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
      authorizeQueue: input.security.queue,
      authorizeOverride: input.security.override,
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
    makeAdvanceProductionStageRoute({
      advance: input.application.advanceProductionStage,
      authenticate: input.security.authenticate,
      authorize: input.security.stage,
      ...actor,
    }),
  );

  return routes;
};

export const makePostgresProductionApplication = (
  deps: Omit<ProductionApplicationDeps, 'repositories'> & { db: Database },
): ProductionApplication =>
  makeProductionApplication({
    ...deps,
    repositories: {
      acceptSchedule: makeAcceptScheduleRepository(deps),
      applyOrderDemand: makeApplyOrderDemandRepository(deps),
      advanceProductionStage: makeAdvanceProductionStageRepository(deps),
      assignStageMachines: makeAssignStageMachinesRepository(deps),
      createSchedule: makeCreateScheduleRepository(deps),
      listProductionLocations: makeListProductionLocationsRepository(deps.db),
      listProductionOrders: makeListProductionOrdersRepository(deps.db),
      loadProductionBoard: makeLoadProductionBoardRepository(deps),
      loadSchedule: makeLoadScheduleRepository(deps.db),
      loadProductionWorkspace: makeLoadProductionWorkspaceRepository(deps.db),
      manageBatchMembership: makeManageBatchMembershipRepository(deps),
      manageProductionResources: makeManageProductionResourcesRepository(deps),
      manageProductionShift: makeManageProductionShiftRepository(deps),
      placeProductionOrder: makePlaceProductionOrderRepository(deps),
      publishSchedulerConfig: makePublishSchedulerConfigRepository(deps),
      recordOrderIntake: makeRecordOrderIntakeRepository(deps),
      setProductionOrderPriority:
        makeSetProductionOrderPriorityRepository(deps),
      startSchedule: makeStartScheduleRepository(deps),
    },
  });

export const makePostgresProductionModule = (
  deps: Omit<ProductionApplicationDeps, 'repositories'> & {
    db: Database;
    security: ProductionRouteSecurity;
  },
): Readonly<{ application: ProductionApplication; routes: Router }> => {
  const application = makePostgresProductionApplication(deps);
  return {
    application,
    routes: makeProductionRoutes({ application, security: deps.security }),
  };
};
