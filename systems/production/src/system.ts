import type { ProductionActorReadV1Capability } from '@pressly/access-system/capabilities/production-actor-read-v1';
import type { ProductionScopeReconciliationV1Capability } from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { configError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/cells/id-source';
import type { ResultUnitOfWork } from '@pressly/cells/unit-of-work';
import { makeListRecentProductionOrderActivityV1Capability } from './capabilities/list-recent-order-activity-v1.postgres.ts';
import { makeResolveProductionFulfillmentReferencesV1Capability } from './capabilities/resolve-fulfillment-references-v1.postgres.ts';
import { makeApplyFulfillmentDemandCell } from './cells/demand/apply-fulfillment-demand/cell.ts';
import { applyFulfillmentDemandIdempotency } from './cells/demand/apply-fulfillment-demand/idempotency.ts';
import { makeApplyFulfillmentDemandPostgresRepository } from './cells/demand/apply-fulfillment-demand/postgres.ts';
import { makeChangeAdmissionCell } from './cells/demand/change-admission/cell.ts';
import { changeAdmissionIdempotency } from './cells/demand/change-admission/idempotency.ts';
import { makeChangeAdmissionPostgresRepository } from './cells/demand/change-admission/postgres.ts';
import { makeChangeOrderResolutionCell } from './cells/demand/change-order-resolution/cell.ts';
import { changeOrderResolutionIdempotency } from './cells/demand/change-order-resolution/idempotency.ts';
import { makeChangeOrderResolutionPostgresRepository } from './cells/demand/change-order-resolution/postgres.ts';
import { makeCommitOrderBacklogCell } from './cells/demand/commit-order-backlog/cell.ts';
import { commitOrderBacklogIdempotency } from './cells/demand/commit-order-backlog/idempotency.ts';
import { makeCommitOrderBacklogPostgresRepository } from './cells/demand/commit-order-backlog/postgres.ts';
import { makePreviewOrderBacklogCell } from './cells/demand/preview-order-backlog/cell.ts';
import { makePreviewOrderBacklogPostgresRepository } from './cells/demand/preview-order-backlog/postgres.ts';
import { makeRecordOrderIntakeCell } from './cells/demand/record-order-intake/cell.ts';
import { recordOrderIntakeIdempotency } from './cells/demand/record-order-intake/idempotency.ts';
import { makeRecordOrderIntakePostgresRepository } from './cells/demand/record-order-intake/postgres.ts';
import { makeResolveSourceClosedFulfillmentCell } from './cells/demand/resolve-source-closed-fulfillment/cell.ts';
import { makeResolveSourceClosedFulfillmentPostgresRepository } from './cells/demand/resolve-source-closed-fulfillment/postgres.ts';
import { makeSetOrderPriorityCell } from './cells/demand/set-order-priority/cell.ts';
import { setOrderPriorityIdempotency } from './cells/demand/set-order-priority/idempotency.ts';
import { makeSetOrderPriorityPostgresRepository } from './cells/demand/set-order-priority/postgres.ts';
import { makeAssignStageMachinesCell } from './cells/floor/assign-stage-machines/cell.ts';
import { assignStageMachinesIdempotency } from './cells/floor/assign-stage-machines/idempotency.ts';
import { makeAssignStageMachinesPostgresRepository } from './cells/floor/assign-stage-machines/postgres.ts';
import { makeAdvanceStageCell } from './cells/floor/advance-stage/cell.ts';
import { makeAdvanceStagePolicy } from './cells/floor/advance-stage/confirmation.ts';
import type { AdvanceStageClock } from './cells/floor/advance-stage/execute.ts';
import { advanceStageIdempotency } from './cells/floor/advance-stage/idempotency.ts';
import {
  makeAdvanceStagePostgresRepository,
  type AdvanceStagePostgresDependencies,
} from './cells/floor/advance-stage/postgres.ts';
import { makeFreezeBatchMembershipCell } from './cells/floor/freeze-batch-membership/cell.ts';
import { freezeBatchMembershipIdempotency } from './cells/floor/freeze-batch-membership/idempotency.ts';
import { makeFreezeBatchMembershipPostgresRepository } from './cells/floor/freeze-batch-membership/postgres.ts';
import { makeReconcileBatchProgressCell } from './cells/floor/reconcile-batch-progress/cell.ts';
import type { ReconcileBatchProgressSignals } from './cells/floor/reconcile-batch-progress/execute.ts';
import { reconcileBatchProgressIdempotency } from './cells/floor/reconcile-batch-progress/idempotency.ts';
import { makeReconcileBatchProgressPostgresRepository } from './cells/floor/reconcile-batch-progress/postgres.ts';
import { makeUnfreezeBatchMembershipCell } from './cells/floor/unfreeze-batch-membership/cell.ts';
import { unfreezeBatchMembershipIdempotency } from './cells/floor/unfreeze-batch-membership/idempotency.ts';
import { makeUnfreezeBatchMembershipPostgresRepository } from './cells/floor/unfreeze-batch-membership/postgres.ts';
import { makeListHistoryActivityCell } from './cells/history/list-activity/cell.ts';
import { makeListHistoryActivityPostgresRepository } from './cells/history/list-activity/postgres.ts';
import { makeLoadHistoryRunCell } from './cells/history/load-run/cell.ts';
import { makeLoadHistoryRunPostgresRepository } from './cells/history/load-run/postgres.ts';
import { makeListHistoryRunsCell } from './cells/history/list-runs/cell.ts';
import { makeListHistoryRunsPostgresRepository } from './cells/history/list-runs/postgres.ts';
import { makeListHistoryPlansCell } from './cells/history/list-plans/cell.ts';
import { makeListHistoryPlansPostgresRepository } from './cells/history/list-plans/postgres.ts';
import { makeSubscribeProductionChangesCell } from './cells/live/subscribe-changes/cell.ts';
import type { ProductionChangeSource } from './cells/live/subscribe-changes/types.ts';
import { makeListOrderControlCell } from './cells/orders/list-order-control/cell.ts';
import { makeListOrderControlPostgresRepository } from './cells/orders/list-order-control/postgres.ts';
import { makeListOrdersCell } from './cells/orders/list-orders/cell.ts';
import { makeListOrdersPostgresRepository } from './cells/orders/list-orders/postgres.ts';
import { makeCommitOrderRouteCell } from './cells/orders/commit-order-route/cell.ts';
import type { CommitOrderRouteSignals } from './cells/orders/commit-order-route/execute.ts';
import { commitOrderRouteIdempotency } from './cells/orders/commit-order-route/idempotency.ts';
import { makeCommitOrderRoutePostgresRepository } from './cells/orders/commit-order-route/postgres.ts';
import { makePreviewOrderRouteCell } from './cells/orders/preview-order-route/cell.ts';
import type { PreviewOrderRouteSignals } from './cells/orders/preview-order-route/types.ts';
import { makePreviewOrderRoutePostgresRepository } from './cells/orders/preview-order-route/postgres.ts';
import { makeLoadBoardCell } from './cells/queries/load-board/cell.ts';
import { makeLoadBoardPostgresRepository } from './cells/queries/load-board/postgres.ts';
import { makeLoadRemainingDayForecastCell } from './cells/queries/load-remaining-day-forecast/cell.ts';
import { makeLoadRemainingDayForecastPostgresRepository } from './cells/queries/load-remaining-day-forecast/postgres.ts';
import type { RemainingDayForecastScheduler } from './cells/queries/load-remaining-day-forecast/types.ts';
import { makeLoadWorkspaceCell } from './cells/queries/load-workspace/cell.ts';
import { makeLoadWorkspacePostgresRepository } from './cells/queries/load-workspace/postgres.ts';
import type { WorkspaceScheduler } from './cells/queries/load-workspace/types.ts';
import { makeListLocationsCell } from './cells/resources/list-locations/cell.ts';
import { makeListLocationsPostgresRepository } from './cells/resources/list-locations/postgres.ts';
import { makeManageResourcesCell } from './cells/resources/manage-resources/cell.ts';
import { manageResourcesIdempotency } from './cells/resources/manage-resources/idempotency.ts';
import { makeManageResourcesPostgresRepository } from './cells/resources/manage-resources/postgres.ts';
import { makeAcceptScheduleCell } from './cells/scheduling/accept-schedule/cell.ts';
import { acceptScheduleIdempotency } from './cells/scheduling/accept-schedule/idempotency.ts';
import { makeAcceptSchedulePostgresRepository } from './cells/scheduling/accept-schedule/postgres.ts';
import { makeAttemptAutomaticPlacementCell } from './cells/scheduling/attempt-automatic-placement/cell.ts';
import { makeAttemptAutomaticPlacementPostgresRepository } from './cells/scheduling/attempt-automatic-placement/postgres.ts';
import { makeConfirmOrderOvertimeCell } from './cells/scheduling/confirm-order-overtime/cell.ts';
import type { ConfirmOrderOvertimeSignals } from './cells/scheduling/confirm-order-overtime/execute.ts';
import { confirmOrderOvertimeIdempotency } from './cells/scheduling/confirm-order-overtime/idempotency.ts';
import { makeConfirmOrderOvertimePostgresRepository } from './cells/scheduling/confirm-order-overtime/postgres.ts';
import { makeCreateScheduleCell } from './cells/scheduling/create-schedule/cell.ts';
import { createScheduleIdempotency } from './cells/scheduling/create-schedule/idempotency.ts';
import { makeCreateSchedulePostgresRepository } from './cells/scheduling/create-schedule/postgres.ts';
import { makeCreateShiftCell } from './cells/scheduling/create-shift/cell.ts';
import { createShiftIdempotency } from './cells/scheduling/create-shift/idempotency.ts';
import { makeCreateShiftPostgresRepository } from './cells/scheduling/create-shift/postgres.ts';
import { makeLoadScheduleCell } from './cells/scheduling/load-schedule/cell.ts';
import { makeLoadSchedulePostgresRepository } from './cells/scheduling/load-schedule/postgres.ts';
import { makePlaceOrderAutomaticallyCell } from './cells/scheduling/place-order-automatically/cell.ts';
import {
  makeExecutePlaceOrderAutomaticallyInTransaction,
  type PlaceOrderAutomaticallySignals,
} from './cells/scheduling/place-order-automatically/execute.ts';
import { placeOrderAutomaticallyIdempotency } from './cells/scheduling/place-order-automatically/idempotency.ts';
import {
  makePlaceOrderAutomaticallyPostgresRepository,
  makePlaceOrderAutomaticallyTransactionRepository,
} from './cells/scheduling/place-order-automatically/postgres.ts';
import { makePlaceOrderExactlyCell } from './cells/scheduling/place-order-exactly/cell.ts';
import type { PlaceOrderExactlySignals } from './cells/scheduling/place-order-exactly/execute.ts';
import { placeOrderExactlyIdempotency } from './cells/scheduling/place-order-exactly/idempotency.ts';
import { makePlaceOrderExactlyPostgresRepository } from './cells/scheduling/place-order-exactly/postgres.ts';
import { makePublishSchedulerConfigCell } from './cells/scheduling/publish-scheduler-config/cell.ts';
import { publishSchedulerConfigIdempotency } from './cells/scheduling/publish-scheduler-config/idempotency.ts';
import { makePublishSchedulerConfigPostgresRepository } from './cells/scheduling/publish-scheduler-config/postgres.ts';
import { makeReplaceShiftSelectionCell } from './cells/scheduling/replace-shift-selection/cell.ts';
import { replaceShiftSelectionIdempotency } from './cells/scheduling/replace-shift-selection/idempotency.ts';
import { makeReplaceShiftSelectionPostgresRepository } from './cells/scheduling/replace-shift-selection/postgres.ts';
import { makeStartScheduleCell } from './cells/scheduling/start-schedule/cell.ts';
import { startScheduleIdempotency } from './cells/scheduling/start-schedule/idempotency.ts';
import { makeStartSchedulePostgresRepository } from './cells/scheduling/start-schedule/postgres.ts';
import { makeUpdateShiftCell } from './cells/scheduling/update-shift/cell.ts';
import { updateShiftIdempotency } from './cells/scheduling/update-shift/idempotency.ts';
import { makeUpdateShiftPostgresRepository } from './cells/scheduling/update-shift/postgres.ts';
import { forecastFixedPulseDemandOutlookV1 } from './model/fixed-pulse-demand-outlook/forecast-v1.ts';
import { proposeOnlinePlacementV1 } from './model/online-order-placement/propose-v1.ts';
import { proposeFixedPulseScheduleV2 } from './model/production-schedule/propose-v2.ts';
import { productionRules } from './model/rules.ts';
import type { ProductionResultUnitOfWorkObserver } from './postgres/result-unit-of-work-observer.ts';
import type { ProductionSchema } from './schema/production-schema.ts';

const unavailableProductionChangeSource: ProductionChangeSource = Object.freeze(
  {
    subscribe: () => () => undefined,
    currentRevision: async () => {
      throw configError({
        code: 'production_change_source_unavailable',
        message:
          'The Production system was assembled without a live change source.',
      });
    },
  },
);

export const canonicalWorkspaceScheduler: WorkspaceScheduler = Object.freeze({
  forecastDemand: forecastFixedPulseDemandOutlookV1,
  proposeOnlinePlacement: proposeOnlinePlacementV1,
});

export const canonicalRemainingDayForecastScheduler: RemainingDayForecastScheduler =
  Object.freeze({
    proposeOnlinePlacement: proposeOnlinePlacementV1,
  });

export type ProductionSystemUnitOfWorkOperation =
  | 'production.accept_schedule'
  | 'production.advance_stage'
  | 'production.apply_fulfillment_demand'
  | 'production.assign_stage_machines'
  | 'production.attempt_automatic_placement'
  | 'production.change_admission'
  | 'production.change_order_resolution'
  | 'production.commit_order_backlog'
  | 'production.confirm_order_overtime'
  | 'production.route_order'
  | 'production.create_schedule'
  | 'production.create_shift'
  | 'production.manage_batch_membership'
  | 'production.manage_resources'
  | 'production.place_order_automatically'
  | 'production.place_order_exactly'
  | 'production.publish_scheduler_config'
  | 'production.record_order_intake'
  | 'production.reconcile_batch_progress'
  | 'production.replace_shift_selection'
  | 'production.set_order_priority'
  | 'production.start_schedule'
  | 'production.update_shift';

export type ProductionSystemUnitOfWorkObserver = <Operations>(
  operation: ProductionSystemUnitOfWorkOperation,
  unitOfWork: ResultUnitOfWork<Operations>,
) => ResultUnitOfWork<Operations>;

export type ProductionSystemSignals = Readonly<{
  planSuperseded?: () => void;
  runStarted?: () => void;
  batchFrozen?: (input: { source: 'explicit' | 'stage_start' }) => void;
  placementOutcome?: (
    input:
      | Parameters<PlaceOrderAutomaticallySignals['placementOutcome']>[0]
      | Parameters<PlaceOrderExactlySignals['placementOutcome']>[0]
      | Parameters<ConfirmOrderOvertimeSignals['placementOutcome']>[0],
  ) => void;
  queueConflict?: (input: {
    operation:
      | 'automatic_placement'
      | 'freeze_membership'
      | 'manager_exact_placement'
      | 'overtime_confirmation'
      | 'unfreeze_membership'
      | 'order_route_commit'
      | 'order_route_preview';
  }) => void;
  overtimeConfirmed?: ConfirmOrderOvertimeSignals['overtimeConfirmed'];
  orderRouteOutcome?: (
    input:
      | Parameters<PreviewOrderRouteSignals['orderRouteOutcome']>[0]
      | Parameters<CommitOrderRouteSignals['orderRouteOutcome']>[0],
  ) => void;
  progressReconciled?: ReconcileBatchProgressSignals['progressReconciled'];
}>;

export type ProductionSystemDependencies = Readonly<{
  db: PostgresDatabase;
  schema: ProductionSchema;
  ids: IdSource;
  clock: AdvanceStageClock;
  productionActorReadV1: ProductionActorReadV1Capability;
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability;
  changeSource?: ProductionChangeSource;
  remainingDayForecastScheduler?: RemainingDayForecastScheduler;
  workspaceScheduler?: WorkspaceScheduler;
  signals?: ProductionSystemSignals;
  observeUnitOfWork?: AdvanceStagePostgresDependencies['observeUnitOfWork'];
  observeCellUnitOfWork?: ProductionSystemUnitOfWorkObserver;
}>;

const observedUnitOfWork = (
  deps: ProductionSystemDependencies,
  operation: ProductionSystemUnitOfWorkOperation,
): ProductionResultUnitOfWorkObserver | undefined => {
  const observer = deps.observeCellUnitOfWork;
  return observer === undefined
    ? undefined
    : (unitOfWork) => observer(operation, unitOfWork);
};

export const makeProductionSystem = (deps: ProductionSystemDependencies) => {
  const acceptScheduleObserver = observedUnitOfWork(
    deps,
    'production.accept_schedule',
  );
  const applyFulfillmentDemandObserver = observedUnitOfWork(
    deps,
    'production.apply_fulfillment_demand',
  );
  const assignStageMachinesObserver = observedUnitOfWork(
    deps,
    'production.assign_stage_machines',
  );
  const attemptAutomaticPlacementObserver = observedUnitOfWork(
    deps,
    'production.attempt_automatic_placement',
  );
  const changeAdmissionObserver = observedUnitOfWork(
    deps,
    'production.change_admission',
  );
  const changeOrderResolutionObserver = observedUnitOfWork(
    deps,
    'production.change_order_resolution',
  );
  const commitOrderBacklogObserver = observedUnitOfWork(
    deps,
    'production.commit_order_backlog',
  );
  const commitOrderRouteObserver = observedUnitOfWork(
    deps,
    'production.route_order',
  );
  const confirmOrderOvertimeObserver = observedUnitOfWork(
    deps,
    'production.confirm_order_overtime',
  );
  const createScheduleObserver = observedUnitOfWork(
    deps,
    'production.create_schedule',
  );
  const createShiftObserver = observedUnitOfWork(
    deps,
    'production.create_shift',
  );
  const recordOrderIntakeObserver = observedUnitOfWork(
    deps,
    'production.record_order_intake',
  );
  const publishSchedulerConfigObserver = observedUnitOfWork(
    deps,
    'production.publish_scheduler_config',
  );
  const membershipObserver = observedUnitOfWork(
    deps,
    'production.manage_batch_membership',
  );
  const manageResourcesObserver = observedUnitOfWork(
    deps,
    'production.manage_resources',
  );
  const placeOrderAutomaticallyObserver = observedUnitOfWork(
    deps,
    'production.place_order_automatically',
  );
  const placeOrderExactlyObserver = observedUnitOfWork(
    deps,
    'production.place_order_exactly',
  );
  const reconcileBatchProgressObserver = observedUnitOfWork(
    deps,
    'production.reconcile_batch_progress',
  );
  const replaceShiftSelectionObserver = observedUnitOfWork(
    deps,
    'production.replace_shift_selection',
  );
  const setOrderPriorityObserver = observedUnitOfWork(
    deps,
    'production.set_order_priority',
  );
  const startScheduleObserver = observedUnitOfWork(
    deps,
    'production.start_schedule',
  );
  const updateShiftObserver = observedUnitOfWork(
    deps,
    'production.update_shift',
  );
  const acceptSchedule = makeAcceptScheduleCell({
    repo: makeAcceptSchedulePostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(acceptScheduleObserver === undefined
          ? {}
          : { observeUnitOfWork: acceptScheduleObserver }),
      },
      deps.schema,
    ),
    idempotency: acceptScheduleIdempotency,
    policy: productionRules,
    clock: deps.clock,
  });
  const applyFulfillmentDemand = makeApplyFulfillmentDemandCell({
    repo: makeApplyFulfillmentDemandPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        productionScopeReconciliationV1: deps.productionScopeReconciliationV1,
        ...(applyFulfillmentDemandObserver === undefined
          ? {}
          : { observeUnitOfWork: applyFulfillmentDemandObserver }),
      },
      deps.schema,
    ),
    idempotency: applyFulfillmentDemandIdempotency,
    policy: productionRules,
    clock: deps.clock,
    ids: deps.ids,
  });
  const assignStageMachines = makeAssignStageMachinesCell({
    repo: makeAssignStageMachinesPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(assignStageMachinesObserver === undefined
          ? {}
          : { observeUnitOfWork: assignStageMachinesObserver }),
      },
      deps.schema,
    ),
    idempotency: assignStageMachinesIdempotency,
    policy: productionRules,
    clock: deps.clock,
  });
  const changeAdmission = makeChangeAdmissionCell({
    repo: makeChangeAdmissionPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(changeAdmissionObserver === undefined
          ? {}
          : { observeUnitOfWork: changeAdmissionObserver }),
      },
      deps.schema,
    ),
    idempotency: changeAdmissionIdempotency,
    policy: productionRules,
    clock: deps.clock,
  });
  const changeOrderResolution = makeChangeOrderResolutionCell({
    repo: makeChangeOrderResolutionPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(changeOrderResolutionObserver === undefined
          ? {}
          : { observeUnitOfWork: changeOrderResolutionObserver }),
      },
      deps.schema,
    ),
    idempotency: changeOrderResolutionIdempotency,
    policy: productionRules,
    clock: deps.clock,
  });
  const resolveSourceClosedFulfillment = makeResolveSourceClosedFulfillmentCell(
    {
      repo: makeResolveSourceClosedFulfillmentPostgresRepository(
        {
          db: deps.db,
        },
        deps.schema,
      ),
      resolveProductionOrder: changeOrderResolution.execute,
    },
  );
  const commitOrderBacklog = makeCommitOrderBacklogCell({
    repo: makeCommitOrderBacklogPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(commitOrderBacklogObserver === undefined
          ? {}
          : { observeUnitOfWork: commitOrderBacklogObserver }),
      },
      deps.schema,
    ),
    idempotency: commitOrderBacklogIdempotency,
    policy: productionRules,
    clock: deps.clock,
    ids: deps.ids,
  });
  const previewOrderBacklog = makePreviewOrderBacklogCell({
    repo: makePreviewOrderBacklogPostgresRepository(deps.db, deps.schema),
    policy: productionRules,
    clock: deps.clock,
  });
  const advanceStage = makeAdvanceStageCell({
    repo: makeAdvanceStagePostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(deps.observeUnitOfWork === undefined
          ? {}
          : { observeUnitOfWork: deps.observeUnitOfWork }),
      },
      deps.schema,
    ),
    idempotency: advanceStageIdempotency,
    clock: deps.clock,
    policy: makeAdvanceStagePolicy(productionRules),
    ...(deps.signals?.batchFrozen === undefined
      ? {}
      : {
          signals: {
            batchFrozen: (input) => deps.signals?.batchFrozen?.(input),
          },
        }),
  });
  const createShift = makeCreateShiftCell({
    repo: makeCreateShiftPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(createShiftObserver === undefined
          ? {}
          : { observeUnitOfWork: createShiftObserver }),
      },
      deps.schema,
    ),
    idempotency: createShiftIdempotency,
    policy: productionRules,
    ids: deps.ids,
  });
  const createSchedule = makeCreateScheduleCell({
    repo: makeCreateSchedulePostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(createScheduleObserver === undefined
          ? {}
          : { observeUnitOfWork: createScheduleObserver }),
      },
      deps.schema,
    ),
    idempotency: createScheduleIdempotency,
    scheduler: { propose: proposeFixedPulseScheduleV2 },
    policy: productionRules,
    clock: deps.clock,
    ids: deps.ids,
    ...(deps.signals?.planSuperseded === undefined
      ? {}
      : {
          signals: {
            planSuperseded: () => deps.signals?.planSuperseded?.(),
          },
        }),
  });
  const replaceShiftSelection = makeReplaceShiftSelectionCell({
    repo: makeReplaceShiftSelectionPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(replaceShiftSelectionObserver === undefined
          ? {}
          : { observeUnitOfWork: replaceShiftSelectionObserver }),
      },
      deps.schema,
    ),
    idempotency: replaceShiftSelectionIdempotency,
    policy: productionRules,
    clock: deps.clock,
    ...(deps.signals?.planSuperseded === undefined
      ? {}
      : {
          signals: {
            planSuperseded: () => deps.signals?.planSuperseded?.(),
          },
        }),
  });
  const executeAutomaticPlacementInTransaction =
    makeExecutePlaceOrderAutomaticallyInTransaction({
      idempotency: placeOrderAutomaticallyIdempotency,
      policy: productionRules,
      proposeOnlinePlacement: proposeOnlinePlacementV1,
      clock: deps.clock,
    });
  const placeOrderAutomatically = makePlaceOrderAutomaticallyCell({
    repo: makePlaceOrderAutomaticallyPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(placeOrderAutomaticallyObserver === undefined
          ? {}
          : { observeUnitOfWork: placeOrderAutomaticallyObserver }),
      },
      deps.schema,
    ),
    idempotency: placeOrderAutomaticallyIdempotency,
    policy: productionRules,
    proposeOnlinePlacement: proposeOnlinePlacementV1,
    clock: deps.clock,
    signals: {
      placementOutcome: (input) => deps.signals?.placementOutcome?.(input),
      queueConflict: (input) => deps.signals?.queueConflict?.(input),
    },
  });
  const attemptAutomaticPlacement = makeAttemptAutomaticPlacementCell({
    repo: makeAttemptAutomaticPlacementPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        placeAutomatically: ({ database, command }) =>
          executeAutomaticPlacementInTransaction({
            repository: makePlaceOrderAutomaticallyTransactionRepository(
              {
                db: database,
                ids: deps.ids,
              },
              deps.schema,
            ),
            command,
          }),
        ...(attemptAutomaticPlacementObserver === undefined
          ? {}
          : { observeUnitOfWork: attemptAutomaticPlacementObserver }),
      },
      deps.schema,
    ),
    clock: deps.clock,
  });
  const placeOrderExactly = makePlaceOrderExactlyCell({
    repo: makePlaceOrderExactlyPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(placeOrderExactlyObserver === undefined
          ? {}
          : { observeUnitOfWork: placeOrderExactlyObserver }),
      },
      deps.schema,
    ),
    idempotency: placeOrderExactlyIdempotency,
    policy: productionRules,
    proposeOnlinePlacement: proposeOnlinePlacementV1,
    clock: deps.clock,
    signals: {
      placementOutcome: (input) => deps.signals?.placementOutcome?.(input),
      queueConflict: (input) => deps.signals?.queueConflict?.(input),
    },
  });
  const confirmOrderOvertime = makeConfirmOrderOvertimeCell({
    repo: makeConfirmOrderOvertimePostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(confirmOrderOvertimeObserver === undefined
          ? {}
          : { observeUnitOfWork: confirmOrderOvertimeObserver }),
      },
      deps.schema,
    ),
    idempotency: confirmOrderOvertimeIdempotency,
    policy: productionRules,
    proposeOnlinePlacement: proposeOnlinePlacementV1,
    clock: deps.clock,
    signals: {
      placementOutcome: (input) => deps.signals?.placementOutcome?.(input),
      queueConflict: (input) => deps.signals?.queueConflict?.(input),
      overtimeConfirmed: () => deps.signals?.overtimeConfirmed?.(),
    },
  });
  const startSchedule = makeStartScheduleCell({
    repo: makeStartSchedulePostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(startScheduleObserver === undefined
          ? {}
          : { observeUnitOfWork: startScheduleObserver }),
      },
      deps.schema,
    ),
    idempotency: startScheduleIdempotency,
    policy: productionRules,
    clock: deps.clock,
    ...(deps.signals?.runStarted === undefined
      ? {}
      : { signals: { runStarted: () => deps.signals?.runStarted?.() } }),
  });
  const recordOrderIntake = makeRecordOrderIntakeCell({
    repo: makeRecordOrderIntakePostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(recordOrderIntakeObserver === undefined
          ? {}
          : { observeUnitOfWork: recordOrderIntakeObserver }),
      },
      deps.schema,
    ),
    idempotency: recordOrderIntakeIdempotency,
    policy: productionRules,
    clock: deps.clock,
  });
  const freezeBatchMembership = makeFreezeBatchMembershipCell({
    repo: makeFreezeBatchMembershipPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(membershipObserver === undefined
          ? {}
          : { observeUnitOfWork: membershipObserver }),
      },
      deps.schema,
    ),
    idempotency: freezeBatchMembershipIdempotency,
    policy: productionRules,
    clock: deps.clock,
    signals: {
      batchFrozen: (input) => deps.signals?.batchFrozen?.(input),
      queueConflict: (input) => deps.signals?.queueConflict?.(input),
    },
  });
  const unfreezeBatchMembership = makeUnfreezeBatchMembershipCell({
    repo: makeUnfreezeBatchMembershipPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(membershipObserver === undefined
          ? {}
          : { observeUnitOfWork: membershipObserver }),
      },
      deps.schema,
    ),
    idempotency: unfreezeBatchMembershipIdempotency,
    policy: productionRules,
    clock: deps.clock,
    signals: {
      queueConflict: (input) => deps.signals?.queueConflict?.(input),
    },
  });
  const reconcileBatchProgress = makeReconcileBatchProgressCell({
    repo: makeReconcileBatchProgressPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(reconcileBatchProgressObserver === undefined
          ? {}
          : { observeUnitOfWork: reconcileBatchProgressObserver }),
      },
      deps.schema,
    ),
    idempotency: reconcileBatchProgressIdempotency,
    policy: productionRules,
    clock: deps.clock,
    signals: {
      progressReconciled: (input) => deps.signals?.progressReconciled?.(input),
    },
  });
  const setOrderPriority = makeSetOrderPriorityCell({
    repo: makeSetOrderPriorityPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(setOrderPriorityObserver === undefined
          ? {}
          : { observeUnitOfWork: setOrderPriorityObserver }),
      },
      deps.schema,
    ),
    idempotency: setOrderPriorityIdempotency,
    policy: productionRules,
    clock: deps.clock,
  });
  const listHistoryPlans = makeListHistoryPlansCell({
    repo: makeListHistoryPlansPostgresRepository(
      deps.db,
      deps.schema,
      deps.productionScopeReconciliationV1,
    ),
    clock: deps.clock,
  });
  const listHistoryActivity = makeListHistoryActivityCell({
    repo: makeListHistoryActivityPostgresRepository(
      deps.db,
      deps.schema,
      deps.productionActorReadV1,
      deps.productionScopeReconciliationV1,
    ),
    clock: deps.clock,
  });
  const loadHistoryRun = makeLoadHistoryRunCell({
    repo: makeLoadHistoryRunPostgresRepository(
      deps.db,
      deps.schema,
      deps.productionActorReadV1,
      deps.productionScopeReconciliationV1,
    ),
    clock: deps.clock,
  });
  const listHistoryRuns = makeListHistoryRunsCell({
    repo: makeListHistoryRunsPostgresRepository(
      deps.db,
      deps.schema,
      deps.productionScopeReconciliationV1,
    ),
    clock: deps.clock,
  });
  const listLocations = makeListLocationsCell({
    repo: makeListLocationsPostgresRepository(
      deps.productionScopeReconciliationV1,
    ),
    clock: deps.clock,
  });
  const loadSchedule = makeLoadScheduleCell(
    makeLoadSchedulePostgresRepository(deps.db, deps.schema),
  );
  const publishSchedulerConfig = makePublishSchedulerConfigCell({
    repo: makePublishSchedulerConfigPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(publishSchedulerConfigObserver === undefined
          ? {}
          : { observeUnitOfWork: publishSchedulerConfigObserver }),
      },
      deps.schema,
    ),
    idempotency: publishSchedulerConfigIdempotency,
    clock: deps.clock,
    ids: deps.ids,
  });
  const updateShift = makeUpdateShiftCell({
    repo: makeUpdateShiftPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(updateShiftObserver === undefined
          ? {}
          : { observeUnitOfWork: updateShiftObserver }),
      },
      deps.schema,
    ),
    idempotency: updateShiftIdempotency,
    policy: productionRules,
    clock: deps.clock,
    ...(deps.signals?.planSuperseded === undefined
      ? {}
      : {
          signals: {
            planSuperseded: () => deps.signals?.planSuperseded?.(),
          },
        }),
  });
  const manageResources = makeManageResourcesCell({
    repo: makeManageResourcesPostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(manageResourcesObserver === undefined
          ? {}
          : { observeUnitOfWork: manageResourcesObserver }),
      },
      deps.schema,
    ),
    idempotency: manageResourcesIdempotency,
    clock: deps.clock,
  });
  const listOrders = makeListOrdersCell({
    repo: makeListOrdersPostgresRepository(
      deps.db,
      deps.schema,
      deps.productionScopeReconciliationV1,
    ),
    clock: deps.clock,
  });
  const listOrderControl = makeListOrderControlCell({
    repo: makeListOrderControlPostgresRepository(
      {
        db: deps.db,
        policy: productionRules,
        productionScopeReconciliationV1: deps.productionScopeReconciliationV1,
      },
      deps.schema,
    ),
    clock: deps.clock,
  });
  const commitOrderRoute = makeCommitOrderRouteCell({
    repo: makeCommitOrderRoutePostgresRepository(
      {
        db: deps.db,
        ids: deps.ids,
        ...(commitOrderRouteObserver === undefined
          ? {}
          : { observeUnitOfWork: commitOrderRouteObserver }),
      },
      deps.schema,
    ),
    idempotency: commitOrderRouteIdempotency,
    policy: productionRules,
    clock: deps.clock,
    signals: {
      orderRouteOutcome: (input) => deps.signals?.orderRouteOutcome?.(input),
      queueConflict: (input) => deps.signals?.queueConflict?.(input),
    },
  });
  const loadBoard = makeLoadBoardCell({
    repo: makeLoadBoardPostgresRepository(deps.db, deps.schema),
    clock: deps.clock,
    policy: productionRules,
  });
  const loadRemainingDayForecast = makeLoadRemainingDayForecastCell({
    repo: makeLoadRemainingDayForecastPostgresRepository(
      deps.db,
      deps.schema,
      deps.productionScopeReconciliationV1,
    ),
    clock: deps.clock,
    policy: productionRules,
    scheduler:
      deps.remainingDayForecastScheduler ??
      canonicalRemainingDayForecastScheduler,
  });
  const loadWorkspace = makeLoadWorkspaceCell({
    repo: makeLoadWorkspacePostgresRepository(
      deps.db,
      deps.schema,
      deps.productionScopeReconciliationV1,
    ),
    clock: deps.clock,
    policy: productionRules,
    scheduler: deps.workspaceScheduler ?? canonicalWorkspaceScheduler,
  });
  const previewOrderRoute = makePreviewOrderRouteCell({
    repo: makePreviewOrderRoutePostgresRepository(deps.db, deps.schema),
    policy: productionRules,
    signals: {
      orderRouteOutcome: (input) => deps.signals?.orderRouteOutcome?.(input),
      queueConflict: (input) => deps.signals?.queueConflict?.(input),
    },
  });
  const subscribeChanges = makeSubscribeProductionChangesCell({
    source: deps.changeSource ?? unavailableProductionChangeSource,
  });

  return Object.freeze({
    cells: Object.freeze({
      acceptSchedule,
      advanceStage,
      applyFulfillmentDemand,
      assignStageMachines,
      attemptAutomaticPlacement,
      changeAdmission,
      changeOrderResolution,
      commitOrderBacklog,
      commitOrderRoute,
      confirmOrderOvertime,
      createSchedule,
      createShift,
      freezeBatchMembership,
      listHistoryActivity,
      listHistoryPlans,
      listHistoryRuns,
      listLocations,
      listOrderControl,
      listOrders,
      loadBoard,
      loadHistoryRun,
      loadRemainingDayForecast,
      loadWorkspace,
      loadSchedule,
      manageResources,
      placeOrderAutomatically,
      placeOrderExactly,
      previewOrderBacklog,
      previewOrderRoute,
      publishSchedulerConfig,
      recordOrderIntake,
      reconcileBatchProgress,
      replaceShiftSelection,
      resolveSourceClosedFulfillment,
      setOrderPriority,
      startSchedule,
      subscribeChanges,
      unfreezeBatchMembership,
      updateShift,
    }),
    capabilities: Object.freeze({
      listRecentOrderActivityV1:
        makeListRecentProductionOrderActivityV1Capability({
          database: deps.db,
          schema: deps.schema,
        }),
      resolveFulfillmentReferencesV1:
        makeResolveProductionFulfillmentReferencesV1Capability({
          database: deps.db,
          schema: deps.schema,
        }),
    }),
  });
};
