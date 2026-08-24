import type { PostgresDatabase } from '@pressly/postgres/client';
import { productionTestSchema } from './testing/production-schema.spec-support.ts';
import { describe, expect, it } from 'vitest';
import {
  productionActorReadTestCapability,
  productionScopeReconciliationTestCapability,
} from './testing/production-capabilities.spec-support.ts';
import { applyFulfillmentDemandCellDeclaration } from './cells/demand/apply-fulfillment-demand/cell.ts';
import { acceptScheduleCellDeclaration } from './cells/scheduling/accept-schedule/cell.ts';
import { attemptAutomaticPlacementCellDeclaration } from './cells/scheduling/attempt-automatic-placement/cell.ts';
import { confirmOrderOvertimeCellDeclaration } from './cells/scheduling/confirm-order-overtime/cell.ts';
import { changeAdmissionCellDeclaration } from './cells/demand/change-admission/cell.ts';
import { changeOrderResolutionCellDeclaration } from './cells/demand/change-order-resolution/cell.ts';
import { commitOrderBacklogCellDeclaration } from './cells/demand/commit-order-backlog/cell.ts';
import { previewOrderBacklogCellDeclaration } from './cells/demand/preview-order-backlog/cell.ts';
import { recordOrderIntakeCellDeclaration } from './cells/demand/record-order-intake/cell.ts';
import { resolveSourceClosedFulfillmentCellDeclaration } from './cells/demand/resolve-source-closed-fulfillment/cell.ts';
import { setOrderPriorityCellDeclaration } from './cells/demand/set-order-priority/cell.ts';
import { assignStageMachinesCellDeclaration } from './cells/floor/assign-stage-machines/cell.ts';
import { advanceStageCellDeclaration } from './cells/floor/advance-stage/cell.ts';
import { freezeBatchMembershipCellDeclaration } from './cells/floor/freeze-batch-membership/cell.ts';
import { reconcileBatchProgressCellDeclaration } from './cells/floor/reconcile-batch-progress/cell.ts';
import { unfreezeBatchMembershipCellDeclaration } from './cells/floor/unfreeze-batch-membership/cell.ts';
import { listHistoryActivityCellDeclaration } from './cells/history/list-activity/cell.ts';
import { loadHistoryRunCellDeclaration } from './cells/history/load-run/cell.ts';
import { listHistoryPlansCellDeclaration } from './cells/history/list-plans/cell.ts';
import { listHistoryRunsCellDeclaration } from './cells/history/list-runs/cell.ts';
import { listOrderControlCellDeclaration } from './cells/orders/list-order-control/cell.ts';
import { listOrdersCellDeclaration } from './cells/orders/list-orders/cell.ts';
import { commitOrderRouteCellDeclaration } from './cells/orders/commit-order-route/cell.ts';
import { previewOrderRouteCellDeclaration } from './cells/orders/preview-order-route/cell.ts';
import { loadBoardCellDeclaration } from './cells/queries/load-board/cell.ts';
import { loadRemainingDayForecastCellDeclaration } from './cells/queries/load-remaining-day-forecast/cell.ts';
import { loadWorkspaceCellDeclaration } from './cells/queries/load-workspace/cell.ts';
import { listLocationsCellDeclaration } from './cells/resources/list-locations/cell.ts';
import { manageResourcesCellDeclaration } from './cells/resources/manage-resources/cell.ts';
import { createScheduleCellDeclaration } from './cells/scheduling/create-schedule/cell.ts';
import { createShiftCellDeclaration } from './cells/scheduling/create-shift/cell.ts';
import { loadScheduleCellDeclaration } from './cells/scheduling/load-schedule/cell.ts';
import { placeOrderAutomaticallyCellDeclaration } from './cells/scheduling/place-order-automatically/cell.ts';
import { placeOrderExactlyCellDeclaration } from './cells/scheduling/place-order-exactly/cell.ts';
import { publishSchedulerConfigCellDeclaration } from './cells/scheduling/publish-scheduler-config/cell.ts';
import { replaceShiftSelectionCellDeclaration } from './cells/scheduling/replace-shift-selection/cell.ts';
import { startScheduleCellDeclaration } from './cells/scheduling/start-schedule/cell.ts';
import { updateShiftCellDeclaration } from './cells/scheduling/update-shift/cell.ts';
import { forecastFixedPulseDemandOutlookV1 } from './model/fixed-pulse-demand-outlook/forecast-v1.ts';
import { proposeOnlinePlacementV1 } from './model/online-order-placement/propose-v1.ts';
import {
  canonicalRemainingDayForecastScheduler,
  canonicalWorkspaceScheduler,
  makeProductionSystem,
} from './system.ts';

describe('Production system owner assembly', () => {
  it('owns canonical query scheduler defaults without removing explicit overrides', () => {
    expect(canonicalWorkspaceScheduler).toEqual({
      forecastDemand: forecastFixedPulseDemandOutlookV1,
      proposeOnlinePlacement: proposeOnlinePlacementV1,
    });
    expect(canonicalRemainingDayForecastScheduler).toEqual({
      proposeOnlinePlacement: proposeOnlinePlacementV1,
    });
    expect(Object.isFrozen(canonicalWorkspaceScheduler)).toBe(true);
    expect(Object.isFrozen(canonicalRemainingDayForecastScheduler)).toBe(true);
  });

  it('assembles its named cells without changing their declarations', () => {
    let observedUnitOfWorks = 0;
    const observedOperations: string[] = [];
    const db = {
      transaction: () => undefined,
    } as unknown as PostgresDatabase;
    const system = makeProductionSystem({
      db,
      schema: productionTestSchema,
      productionActorReadV1: productionActorReadTestCapability(),
      productionScopeReconciliationV1:
        productionScopeReconciliationTestCapability(db),
      ids: { next: () => '10000000-0000-4000-8000-000000000001' },
      clock: { now: () => new Date('2026-08-21T15:00:00.000Z') },
      observeUnitOfWork: (unitOfWork) => {
        observedUnitOfWorks += 1;
        return unitOfWork;
      },
      observeCellUnitOfWork: (operation, unitOfWork) => {
        observedOperations.push(operation);
        return unitOfWork;
      },
    });

    expect(Object.keys(system.cells)).toEqual([
      'acceptSchedule',
      'advanceStage',
      'applyFulfillmentDemand',
      'assignStageMachines',
      'attemptAutomaticPlacement',
      'changeAdmission',
      'changeOrderResolution',
      'commitOrderBacklog',
      'commitOrderRoute',
      'confirmOrderOvertime',
      'createSchedule',
      'createShift',
      'freezeBatchMembership',
      'listHistoryActivity',
      'listHistoryPlans',
      'listHistoryRuns',
      'listLocations',
      'listOrderControl',
      'listOrders',
      'loadBoard',
      'loadHistoryRun',
      'loadRemainingDayForecast',
      'loadWorkspace',
      'loadSchedule',
      'manageResources',
      'placeOrderAutomatically',
      'placeOrderExactly',
      'previewOrderBacklog',
      'previewOrderRoute',
      'publishSchedulerConfig',
      'recordOrderIntake',
      'reconcileBatchProgress',
      'replaceShiftSelection',
      'resolveSourceClosedFulfillment',
      'setOrderPriority',
      'startSchedule',
      'subscribeChanges',
      'unfreezeBatchMembership',
      'updateShift',
    ]);
    expect(system.cells.acceptSchedule.contract).toBe(
      acceptScheduleCellDeclaration.contract,
    );
    expect(system.cells.acceptSchedule.surfaces).toBe(
      acceptScheduleCellDeclaration.surfaces,
    );
    expect(system.cells.acceptSchedule.authorization).toBe(
      acceptScheduleCellDeclaration.authorization,
    );
    expect(typeof system.cells.acceptSchedule.execute).toBe('function');
    expect(system.cells.advanceStage.id).toBe('production.advance-stage.v1');
    expect(system.cells.advanceStage.contract).toBe(
      advanceStageCellDeclaration.contract,
    );
    expect(system.cells.advanceStage.surfaces).toBe(
      advanceStageCellDeclaration.surfaces,
    );
    expect(typeof system.cells.advanceStage.execute).toBe('function');
    expect(system.cells.applyFulfillmentDemand.contract).toBe(
      applyFulfillmentDemandCellDeclaration.contract,
    );
    expect(system.cells.applyFulfillmentDemand.surfaces).toBe(
      applyFulfillmentDemandCellDeclaration.surfaces,
    );
    expect(system.cells.applyFulfillmentDemand.kind).toBe('reaction');
    expect(typeof system.cells.applyFulfillmentDemand.execute).toBe('function');
    expect(system.cells.assignStageMachines.contract).toBe(
      assignStageMachinesCellDeclaration.contract,
    );
    expect(system.cells.attemptAutomaticPlacement.contract).toBe(
      attemptAutomaticPlacementCellDeclaration.contract,
    );
    expect(system.cells.attemptAutomaticPlacement.surfaces).toEqual([]);
    expect(typeof system.cells.attemptAutomaticPlacement.execute).toBe(
      'function',
    );
    expect(system.cells.changeAdmission.contract).toBe(
      changeAdmissionCellDeclaration.contract,
    );
    expect(system.cells.changeAdmission.surfaces).toBe(
      changeAdmissionCellDeclaration.surfaces,
    );
    expect(system.cells.changeAdmission.authorization).toBe(
      changeAdmissionCellDeclaration.authorization,
    );
    expect(typeof system.cells.changeAdmission.execute).toBe('function');
    expect(system.cells.changeOrderResolution.contract).toBe(
      changeOrderResolutionCellDeclaration.contract,
    );
    expect(system.cells.changeOrderResolution.surfaces).toBe(
      changeOrderResolutionCellDeclaration.surfaces,
    );
    expect(system.cells.changeOrderResolution.authorization).toBe(
      changeOrderResolutionCellDeclaration.authorization,
    );
    expect(typeof system.cells.changeOrderResolution.execute).toBe('function');
    expect(system.cells.commitOrderBacklog.contract).toBe(
      commitOrderBacklogCellDeclaration.contract,
    );
    expect(system.cells.commitOrderBacklog.surfaces).toBe(
      commitOrderBacklogCellDeclaration.surfaces,
    );
    expect(system.cells.commitOrderBacklog.authorization).toBe(
      commitOrderBacklogCellDeclaration.authorization,
    );
    expect(typeof system.cells.commitOrderBacklog.execute).toBe('function');
    expect(system.cells.confirmOrderOvertime.contract).toBe(
      confirmOrderOvertimeCellDeclaration.contract,
    );
    expect(system.cells.confirmOrderOvertime.surfaces).toBe(
      confirmOrderOvertimeCellDeclaration.surfaces,
    );
    expect(system.cells.createSchedule.contract).toBe(
      createScheduleCellDeclaration.contract,
    );
    expect(system.cells.createSchedule.surfaces).toBe(
      createScheduleCellDeclaration.surfaces,
    );
    expect(system.cells.createSchedule.authorization).toBe(
      createScheduleCellDeclaration.authorization,
    );
    expect(typeof system.cells.createSchedule.execute).toBe('function');
    expect(system.cells.createShift.contract).toBe(
      createShiftCellDeclaration.contract,
    );
    expect(system.cells.createShift.surfaces).toBe(
      createShiftCellDeclaration.surfaces,
    );
    expect(system.cells.createShift.authorization).toBe(
      createShiftCellDeclaration.authorization,
    );
    expect(typeof system.cells.createShift.execute).toBe('function');
    expect(system.cells.recordOrderIntake.contract).toBe(
      recordOrderIntakeCellDeclaration.contract,
    );
    expect(system.cells.recordOrderIntake.surfaces).toBe(
      recordOrderIntakeCellDeclaration.surfaces,
    );
    expect(system.cells.recordOrderIntake.authorization).toBe(
      recordOrderIntakeCellDeclaration.authorization,
    );
    expect(typeof system.cells.recordOrderIntake.execute).toBe('function');
    expect(system.cells.freezeBatchMembership.contract).toBe(
      freezeBatchMembershipCellDeclaration.contract,
    );
    expect(system.cells.listHistoryActivity.contract).toBe(
      listHistoryActivityCellDeclaration.contract,
    );
    expect(system.cells.listHistoryActivity.surfaces).toBe(
      listHistoryActivityCellDeclaration.surfaces,
    );
    expect(system.cells.listHistoryActivity.surfaces).toEqual([]);
    expect(system.cells.listHistoryActivity.authorization).toBe(
      listHistoryActivityCellDeclaration.authorization,
    );
    expect(typeof system.cells.listHistoryActivity.execute).toBe('function');
    expect(system.cells.listHistoryPlans.contract).toBe(
      listHistoryPlansCellDeclaration.contract,
    );
    expect(system.cells.listHistoryPlans.surfaces).toBe(
      listHistoryPlansCellDeclaration.surfaces,
    );
    expect(typeof system.cells.listHistoryPlans.execute).toBe('function');
    expect(system.cells.listHistoryRuns.contract).toBe(
      listHistoryRunsCellDeclaration.contract,
    );
    expect(system.cells.listHistoryRuns.surfaces).toBe(
      listHistoryRunsCellDeclaration.surfaces,
    );
    expect(system.cells.listHistoryRuns.authorization).toBe(
      listHistoryRunsCellDeclaration.authorization,
    );
    expect(typeof system.cells.listHistoryRuns.execute).toBe('function');
    expect(system.cells.loadHistoryRun.contract).toBe(
      loadHistoryRunCellDeclaration.contract,
    );
    expect(system.cells.loadHistoryRun.surfaces).toBe(
      loadHistoryRunCellDeclaration.surfaces,
    );
    expect(system.cells.loadHistoryRun.surfaces).toEqual([]);
    expect(typeof system.cells.loadHistoryRun.execute).toBe('function');
    expect(system.cells.listLocations.contract).toBe(
      listLocationsCellDeclaration.contract,
    );
    expect(system.cells.listLocations.surfaces).toBe(
      listLocationsCellDeclaration.surfaces,
    );
    expect(system.cells.listLocations.authentication).toBe('required');
    expect(system.cells.listLocations.authorization).toBe(
      listLocationsCellDeclaration.authorization,
    );
    expect(typeof system.cells.listLocations.execute).toBe('function');
    expect(system.cells.listOrderControl.contract).toBe(
      listOrderControlCellDeclaration.contract,
    );
    expect(system.cells.listOrderControl.surfaces).toBe(
      listOrderControlCellDeclaration.surfaces,
    );
    expect(system.cells.listOrderControl.surfaces).toEqual([]);
    expect(typeof system.cells.listOrderControl.execute).toBe('function');
    expect(system.cells.loadBoard.contract).toBe(
      loadBoardCellDeclaration.contract,
    );
    expect(system.cells.loadBoard.surfaces).toBe(
      loadBoardCellDeclaration.surfaces,
    );
    expect(system.cells.loadBoard.surfaces).toEqual([]);
    expect(system.cells.loadBoard.authorization).toBe(
      loadBoardCellDeclaration.authorization,
    );
    expect(typeof system.cells.loadBoard.execute).toBe('function');
    expect(system.cells.loadRemainingDayForecast.contract).toBe(
      loadRemainingDayForecastCellDeclaration.contract,
    );
    expect(system.cells.loadRemainingDayForecast.surfaces).toBe(
      loadRemainingDayForecastCellDeclaration.surfaces,
    );
    expect(system.cells.loadRemainingDayForecast.surfaces).toEqual([]);
    expect(system.cells.loadRemainingDayForecast.authorization).toBe(
      loadRemainingDayForecastCellDeclaration.authorization,
    );
    expect(typeof system.cells.loadRemainingDayForecast.execute).toBe(
      'function',
    );
    expect(system.cells.loadWorkspace.contract).toBe(
      loadWorkspaceCellDeclaration.contract,
    );
    expect(system.cells.loadWorkspace.surfaces).toBe(
      loadWorkspaceCellDeclaration.surfaces,
    );
    expect(system.cells.loadWorkspace.surfaces).toEqual([]);
    expect(system.cells.loadWorkspace.authorization).toBe(
      loadWorkspaceCellDeclaration.authorization,
    );
    expect(typeof system.cells.loadWorkspace.execute).toBe('function');
    expect(system.cells.loadSchedule.contract).toBe(
      loadScheduleCellDeclaration.contract,
    );
    expect(system.cells.loadSchedule.surfaces).toBe(
      loadScheduleCellDeclaration.surfaces,
    );
    expect(system.cells.loadSchedule.authorization).toBe(
      loadScheduleCellDeclaration.authorization,
    );
    expect(system.cells.loadSchedule.authorization?.timing).toBe('after-input');
    expect(typeof system.cells.loadSchedule.execute).toBe('function');
    expect(system.cells.placeOrderAutomatically.contract).toBe(
      placeOrderAutomaticallyCellDeclaration.contract,
    );
    expect(system.cells.placeOrderAutomatically.surfaces).toBe(
      placeOrderAutomaticallyCellDeclaration.surfaces,
    );
    expect(system.cells.placeOrderExactly.contract).toBe(
      placeOrderExactlyCellDeclaration.contract,
    );
    expect(system.cells.placeOrderExactly.surfaces).toBe(
      placeOrderExactlyCellDeclaration.surfaces,
    );
    expect(system.cells.publishSchedulerConfig.contract).toBe(
      publishSchedulerConfigCellDeclaration.contract,
    );
    expect(system.cells.publishSchedulerConfig.surfaces).toBe(
      publishSchedulerConfigCellDeclaration.surfaces,
    );
    expect(system.cells.publishSchedulerConfig.authorization).toBe(
      publishSchedulerConfigCellDeclaration.authorization,
    );
    expect(typeof system.cells.publishSchedulerConfig.execute).toBe('function');
    expect(system.cells.updateShift.contract).toBe(
      updateShiftCellDeclaration.contract,
    );
    expect(system.cells.updateShift.surfaces).toBe(
      updateShiftCellDeclaration.surfaces,
    );
    expect(system.cells.updateShift.authorization).toBe(
      updateShiftCellDeclaration.authorization,
    );
    expect(typeof system.cells.updateShift.execute).toBe('function');
    expect(system.cells.manageResources.contract).toBe(
      manageResourcesCellDeclaration.contract,
    );
    expect(system.cells.manageResources.id).toBe(
      'production.manage-resources.v1',
    );
    expect(system.cells.manageResources.surfaces).toBe(
      manageResourcesCellDeclaration.surfaces,
    );
    expect(system.cells.manageResources.surfaces).toEqual([]);
    expect(typeof system.cells.manageResources.execute).toBe('function');
    expect(system.cells.listOrders.contract).toBe(
      listOrdersCellDeclaration.contract,
    );
    expect(system.cells.listOrders.surfaces).toBe(
      listOrdersCellDeclaration.surfaces,
    );
    expect(system.cells.listOrders.authorization).toBe(
      listOrdersCellDeclaration.authorization,
    );
    expect(typeof system.cells.listOrders.execute).toBe('function');
    expect(system.cells.previewOrderBacklog.contract).toBe(
      previewOrderBacklogCellDeclaration.contract,
    );
    expect(system.cells.previewOrderBacklog.surfaces).toBe(
      previewOrderBacklogCellDeclaration.surfaces,
    );
    expect(system.cells.previewOrderBacklog.surfaces).toEqual([]);
    expect(typeof system.cells.previewOrderBacklog.execute).toBe('function');
    expect(system.cells.commitOrderRoute.contract).toBe(
      commitOrderRouteCellDeclaration.contract,
    );
    expect(system.cells.commitOrderRoute.surfaces).toBe(
      commitOrderRouteCellDeclaration.surfaces,
    );
    expect(system.cells.commitOrderRoute.authorization).toBe(
      commitOrderRouteCellDeclaration.authorization,
    );
    expect(typeof system.cells.commitOrderRoute.execute).toBe('function');
    expect(system.cells.previewOrderRoute.contract).toBe(
      previewOrderRouteCellDeclaration.contract,
    );
    expect(system.cells.previewOrderRoute.surfaces).toBe(
      previewOrderRouteCellDeclaration.surfaces,
    );
    expect(system.cells.previewOrderRoute.authorization).toBe(
      previewOrderRouteCellDeclaration.authorization,
    );
    expect(typeof system.cells.previewOrderRoute.execute).toBe('function');
    expect(system.cells.reconcileBatchProgress.contract).toBe(
      reconcileBatchProgressCellDeclaration.contract,
    );
    expect(system.cells.replaceShiftSelection.contract).toBe(
      replaceShiftSelectionCellDeclaration.contract,
    );
    expect(system.cells.replaceShiftSelection.surfaces).toBe(
      replaceShiftSelectionCellDeclaration.surfaces,
    );
    expect(system.cells.replaceShiftSelection.authorization).toBe(
      replaceShiftSelectionCellDeclaration.authorization,
    );
    expect(system.cells.replaceShiftSelection.authorization?.timing).toBe(
      'after-input',
    );
    expect(typeof system.cells.replaceShiftSelection.execute).toBe('function');
    expect(system.cells.resolveSourceClosedFulfillment.contract).toBe(
      resolveSourceClosedFulfillmentCellDeclaration.contract,
    );
    expect(system.cells.resolveSourceClosedFulfillment.surfaces).toEqual([]);
    expect(typeof system.cells.resolveSourceClosedFulfillment.execute).toBe(
      'function',
    );
    expect(system.cells.setOrderPriority.contract).toBe(
      setOrderPriorityCellDeclaration.contract,
    );
    expect(system.cells.setOrderPriority.surfaces).toBe(
      setOrderPriorityCellDeclaration.surfaces,
    );
    expect(typeof system.cells.setOrderPriority.execute).toBe('function');
    expect(system.cells.startSchedule.contract).toBe(
      startScheduleCellDeclaration.contract,
    );
    expect(system.cells.startSchedule.surfaces).toBe(
      startScheduleCellDeclaration.surfaces,
    );
    expect(system.cells.startSchedule.authorization).toBe(
      startScheduleCellDeclaration.authorization,
    );
    expect(system.cells.startSchedule.authorization?.timing).toBe(
      'after-input',
    );
    expect(typeof system.cells.startSchedule.execute).toBe('function');
    expect(system.cells.subscribeChanges.id).toBe(
      'production.subscribe-changes.v1',
    );
    expect(typeof system.cells.subscribeChanges.open).toBe('function');
    expect(system.cells.unfreezeBatchMembership.contract).toBe(
      unfreezeBatchMembershipCellDeclaration.contract,
    );
    expect(observedUnitOfWorks).toBe(1);
    expect(observedOperations).toEqual([
      'production.accept_schedule',
      'production.apply_fulfillment_demand',
      'production.assign_stage_machines',
      'production.change_admission',
      'production.change_order_resolution',
      'production.commit_order_backlog',
      'production.create_shift',
      'production.create_schedule',
      'production.replace_shift_selection',
      'production.place_order_automatically',
      'production.attempt_automatic_placement',
      'production.place_order_exactly',
      'production.confirm_order_overtime',
      'production.start_schedule',
      'production.record_order_intake',
      'production.manage_batch_membership',
      'production.manage_batch_membership',
      'production.reconcile_batch_progress',
      'production.set_order_priority',
      'production.publish_scheduler_config',
      'production.update_shift',
      'production.manage_resources',
      'production.route_order',
    ]);
  });
});
