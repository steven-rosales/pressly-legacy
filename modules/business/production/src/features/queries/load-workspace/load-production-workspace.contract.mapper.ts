import { productionPendingPlacementSchema } from '@pressly/contracts/production';
import type {
  ProductionBoard as ProductionBoardResult,
  ProductionDemandOutlook as ProductionDemandOutlookResult,
  ProductionLiveAutomaticPlacement as ProductionLiveAutomaticPlacementResult,
  ProductionLiveExactBatchTarget as ProductionLiveExactBatchTargetResult,
  ProductionLiveRunChanges as ProductionLiveRunChangesResult,
  ProductionOrderListItem as ProductionOrderListItemResult,
  ProductionPendingOrder as ProductionPendingOrderResult,
  ProductionPendingPlacement as ProductionPendingPlacementResult,
  ProductionStageNextAction as ProductionStageNextActionResult,
  ProductionWorkspace as ProductionWorkspaceResult,
  ProductionWorkspaceParams,
  ProductionWorkspaceQuery,
} from '@pressly/contracts/production';
import { invariantViolationError } from '@pressly/errors/factories';
import { utcIsoFromDate } from '@pressly/time';
import type {
  ProductionBoard,
  ProductionBoardPendingOrder,
  ProductionBoardPendingPlacement,
  ProductionBoardRun,
  ProductionBoardStageNextAction,
} from '../../../foundations/language/board/production-board-read.model.ts';
import type { ProductionOrderListItem } from '../../../foundations/language/orders/production-order-list-item.model.ts';
import type {
  ProductionPendingOrder,
  ProductionPendingPlacement,
} from '../../../foundations/language/scheduling/production-placement.model.ts';
import { toScheduleProposalRepresentation } from '../../../foundations/language/scheduling/schedule-proposal.projection.ts';
import type {
  LoadProductionWorkspaceCommand,
  ProductionDemandOutlook,
  ProductionLiveAutomaticPlacement,
  ProductionLiveExactBatchTarget,
  ProductionLiveRunChanges,
  ProductionWorkspaceLocation,
  ProductionWorkspaceMachine,
  ProductionWorkspaceModel,
  ProductionWorkspaceShift,
  ProductionWorkspaceStation,
} from './load-production-workspace.model.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

export type WorkspaceShiftRow = Readonly<{
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  effectiveFolderCount: number;
  status: string;
  version: number;
}>;

export type WorkspaceOrderRow = Readonly<{
  id: string;
  locationId?: string;
  orderDemandId: string;
  externalOrderId: string;
  dueAt: Date;
  priority: boolean;
  status: string;
  derivedWeightLbs: number;
  bagCount: number | null;
  bagCountSource?: string | null;
  intakeVersion?: number;
  pendingPlacement?: unknown;
  version: number;
}>;

export type WorkspaceRunRow = Readonly<{
  id: string;
  productionShiftId: string;
  status: string;
  queueVersion: number;
  plannedCompletionAt: Date;
  overtimeProposalHash: string | null;
  overtimeQueueVersion: number | null;
  overtimeAcknowledgedBy: string | null;
  overtimeAcknowledgedAt: Date | null;
  version: number;
}>;

const mapOrder = (
  row: WorkspaceOrderRow,
  dueBucket: ProductionPendingOrder['dueBucket'],
): Omit<ProductionPendingOrder, 'placement'> => {
  if (row.bagCount === null)
    throw productionInvariantViolation(
      'production_workspace_order_bag_intake_missing',
      'A board order is missing completed bag intake.',
    );

  return {
    id: row.id,
    externalOrderId: row.externalOrderId,
    dueAt: row.dueAt.toISOString(),
    dueBucket,
    priority: row.priority,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    version: row.version,
  };
};

const defaultPendingPlacement = (
  activeProductionRunIds: readonly string[],
): ProductionPendingPlacement => {
  if (activeProductionRunIds.length > 1)
    return {
      status: 'ambiguous_run',
      reason: 'multiple_started_runs',
      message:
        'More than one production run is active; choose the intended run before placing this order.',
      candidateProductionRunIds: [...activeProductionRunIds].sort(),
    };
  if (activeProductionRunIds.length === 0)
    return {
      status: 'awaiting_run',
      reason: 'no_started_run',
      message: 'This order is waiting for a production run to start.',
    };
  return {
    status: 'awaiting_run',
    reason: 'automatic_placement_not_attempted',
    message: 'Automatic placement has not completed; it can be retried.',
  };
};

export const mapWorkspacePendingOrder = (
  row: WorkspaceOrderRow,
  dueBucket: ProductionPendingOrder['dueBucket'],
  activeProductionRunIds: readonly string[],
): ProductionPendingOrder => {
  const parsed = productionPendingPlacementSchema.safeParse(
    row.pendingPlacement,
  );
  if (row.pendingPlacement != null && !parsed.success)
    throw productionInvariantViolation(
      'production_workspace_pending_placement_invalid',
      'An eligible order has invalid pending placement state.',
    );
  return {
    ...mapOrder(row, dueBucket),
    placement:
      parsed.success &&
      parsed.data.status !== 'awaiting_run' &&
      parsed.data.status !== 'ambiguous_run'
        ? parsed.data
        : defaultPendingPlacement(activeProductionRunIds),
  };
};

export const mapWorkspaceLocation = (row: {
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
}): ProductionWorkspaceLocation => ({ ...row });

export const mapWorkspaceShift = (
  row: WorkspaceShiftRow,
): ProductionWorkspaceShift => {
  if (
    row.status !== 'draft' &&
    row.status !== 'open' &&
    row.status !== 'closed'
  )
    throw productionInvariantViolation(
      'production_workspace_shift_status_invalid',
      `Unknown production shift status: ${row.status}.`,
    );
  return {
    id: row.id,
    locationId: row.locationId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone,
    effectiveFolderCount: row.effectiveFolderCount,
    status: row.status,
    version: row.version,
  };
};

export const mapWorkspaceStation = (row: {
  id: string;
  locationId: string;
  kind: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}): ProductionWorkspaceStation => {
  if (
    row.kind !== 'sorting' &&
    row.kind !== 'washing' &&
    row.kind !== 'drying' &&
    row.kind !== 'folding_packaging'
  )
    throw productionInvariantViolation(
      'production_workspace_station_kind_invalid',
      `Unknown production station kind: ${row.kind}.`,
    );
  return { ...row, kind: row.kind };
};

export const mapWorkspaceMachine = (row: {
  id: string;
  stationKind: string;
  label: string;
  effectiveCapacityLbs: number;
  isActive: boolean;
}): ProductionWorkspaceMachine => {
  if (row.stationKind !== 'washing' && row.stationKind !== 'drying')
    throw productionInvariantViolation(
      'production_workspace_machine_station_invalid',
      `Unknown production machine station: ${row.stationKind}.`,
    );
  return {
    id: row.id,
    stationKind: row.stationKind,
    label: row.label,
    effectiveCapacityLbs: row.effectiveCapacityLbs,
    active: row.isActive,
  };
};

export const mapWorkspaceRun = (row: WorkspaceRunRow): ProductionBoardRun => {
  if (
    row.status !== 'planned' &&
    row.status !== 'started' &&
    row.status !== 'completed'
  )
    throw productionInvariantViolation(
      'production_workspace_run_status_invalid',
      `Unknown production run status: ${row.status}.`,
    );
  return {
    id: row.id,
    productionShiftId: row.productionShiftId,
    status: row.status,
    queueVersion: row.queueVersion,
    plannedCompletionAt: row.plannedCompletionAt,
    overtimeAcknowledgement:
      row.overtimeProposalHash === null ||
      row.overtimeQueueVersion === null ||
      row.overtimeAcknowledgedBy === null ||
      row.overtimeAcknowledgedAt === null
        ? null
        : {
            proposalHash: row.overtimeProposalHash,
            queueVersion: row.overtimeQueueVersion,
            acknowledgedBy: row.overtimeAcknowledgedBy,
            acknowledgedAt: row.overtimeAcknowledgedAt,
          },
    version: row.version,
  };
};

export const toLoadProductionWorkspaceCommand = (input: {
  params: ProductionWorkspaceParams;
  query: ProductionWorkspaceQuery;
}): LoadProductionWorkspaceCommand => ({
  locationId: input.params.locationId,
  ...(input.query.shiftId === undefined
    ? {}
    : { shiftId: input.query.shiftId }),
});

export const toWorkspaceProductionOrderListItem = (
  order: ProductionOrderListItem,
): ProductionOrderListItemResult => ({
  ...order,
  dueAt: utcIsoFromDate(order.dueAt),
});

const toWorkspaceStageNextActionResult = (
  action: ProductionBoardStageNextAction,
): ProductionStageNextActionResult => {
  switch (action.state) {
    case 'available':
    case 'terminal':
      return action;
    case 'blocked':
      return {
        ...action,
        availableAt:
          action.availableAt === null
            ? null
            : utcIsoFromDate(action.availableAt),
      };
    case 'confirmation_required':
      return action.action === 'start'
        ? {
            ...action,
            availableAt: utcIsoFromDate(action.availableAt),
            timing: {
              plannedStartAt: utcIsoFromDate(action.timing.plannedStartAt),
              plannedEndAt: utcIsoFromDate(action.timing.plannedEndAt),
              observedAt: utcIsoFromDate(action.timing.observedAt),
              remainingMilliseconds: action.timing.remainingMilliseconds,
            },
          }
        : {
            ...action,
            availableAt: utcIsoFromDate(action.availableAt),
            timing: {
              actualStartAt: utcIsoFromDate(action.timing.actualStartAt),
              plannedEndAt: utcIsoFromDate(action.timing.plannedEndAt),
              completionBoundaryAt: utcIsoFromDate(
                action.timing.completionBoundaryAt,
              ),
              observedAt: utcIsoFromDate(action.timing.observedAt),
              plannedDurationMilliseconds:
                action.timing.plannedDurationMilliseconds,
              elapsedMilliseconds: action.timing.elapsedMilliseconds,
              remainingMilliseconds: action.timing.remainingMilliseconds,
            },
          };
  }
};

const toWorkspacePendingPlacementResult = (
  placement: ProductionBoardPendingPlacement,
): ProductionPendingPlacementResult => {
  switch (placement.status) {
    case 'awaiting_run':
      return { ...placement };
    case 'ambiguous_run':
      return {
        ...placement,
        candidateProductionRunIds: [...placement.candidateProductionRunIds],
      };
    case 'confirmation_required':
      return {
        ...placement,
        target: { ...placement.target },
        affectedBatchIds: [...placement.affectedBatchIds],
        projectedCompletionAt: utcIsoFromDate(placement.projectedCompletionAt),
      };
    case 'not_placed':
      return {
        ...placement,
        preview:
          placement.preview === null
            ? null
            : {
                ...placement.preview,
                target: { ...placement.preview.target },
                affectedBatchIds: [...placement.preview.affectedBatchIds],
                projectedCompletionAt: utcIsoFromDate(
                  placement.preview.projectedCompletionAt,
                ),
              },
      };
  }
};

export const toWorkspaceProductionPendingOrderResult = (
  order: ProductionBoardPendingOrder,
): ProductionPendingOrderResult => ({
  ...order,
  dueAt: utcIsoFromDate(order.dueAt),
  placement: toWorkspacePendingPlacementResult(order.placement),
});

export const toWorkspaceProductionBoardResult = (
  board: ProductionBoard,
): ProductionBoardResult => ({
  productionShift: {
    ...board.productionShift,
    startsAt: utcIsoFromDate(board.productionShift.startsAt),
    endsAt: utcIsoFromDate(board.productionShift.endsAt),
  },
  productionRun: {
    ...board.productionRun,
    plannedCompletionAt: utcIsoFromDate(
      board.productionRun.plannedCompletionAt,
    ),
    overtimeAcknowledgement:
      board.productionRun.overtimeAcknowledgement === null
        ? null
        : {
            ...board.productionRun.overtimeAcknowledgement,
            acknowledgedAt: utcIsoFromDate(
              board.productionRun.overtimeAcknowledgement.acknowledgedAt,
            ),
          },
  },
  batches: board.batches.map((batch) => ({
    ...batch,
    membership:
      batch.membership.state === 'mutable'
        ? { state: 'mutable' as const }
        : {
            ...batch.membership,
            frozenAt: utcIsoFromDate(batch.membership.frozenAt),
          },
    orders: batch.orders.map((order) => ({
      ...order,
      dueAt: utcIsoFromDate(order.dueAt),
      pinnedAt: order.pinnedAt === null ? null : utcIsoFromDate(order.pinnedAt),
    })),
    stages: batch.stages.map((stage) => ({
      ...stage,
      plannedStartAt: utcIsoFromDate(stage.plannedStartAt),
      plannedEndAt: utcIsoFromDate(stage.plannedEndAt),
      actualStartAt:
        stage.actualStartAt === null
          ? null
          : utcIsoFromDate(stage.actualStartAt),
      actualEndAt:
        stage.actualEndAt === null ? null : utcIsoFromDate(stage.actualEndAt),
      machineIds: [...stage.machineIds],
      nextAction: toWorkspaceStageNextActionResult(stage.nextAction),
      allowedActions: [...stage.allowedActions],
    })),
  })),
  eligibleOrders: board.eligibleOrders.map(
    toWorkspaceProductionPendingOrderResult,
  ),
  asOf: utcIsoFromDate(board.asOf),
});

const toStoredPendingPlacementResult = (
  placement: ProductionPendingPlacement,
): ProductionPendingPlacementResult => {
  switch (placement.status) {
    case 'awaiting_run':
      return { ...placement };
    case 'ambiguous_run':
      return {
        ...placement,
        candidateProductionRunIds: [...placement.candidateProductionRunIds],
      };
    case 'confirmation_required':
      return {
        ...placement,
        target: { ...placement.target },
        affectedBatchIds: [...placement.affectedBatchIds],
      };
    case 'not_placed':
      return {
        ...placement,
        preview:
          placement.preview === null
            ? null
            : {
                ...placement.preview,
                target: { ...placement.preview.target },
                affectedBatchIds: [...placement.preview.affectedBatchIds],
              },
      };
  }
};

const toStoredPendingOrderResult = (
  order: ProductionPendingOrder,
): ProductionPendingOrderResult => ({
  ...order,
  placement: toStoredPendingPlacementResult(order.placement),
});

const toLiveAutomaticPlacementResult = (
  placement: ProductionLiveAutomaticPlacement,
): ProductionLiveAutomaticPlacementResult => ({
  ...placement,
  target: { ...placement.target },
  allowedActions: [...placement.allowedActions],
  capacity: { ...placement.capacity },
  overtime: { ...placement.overtime },
});

const toLiveExactBatchTargetResult = (
  target: ProductionLiveExactBatchTarget,
): ProductionLiveExactBatchTargetResult => ({
  ...target,
  target: { ...target.target },
  allowedActions: [...target.allowedActions],
  capacity: { ...target.capacity },
  overtime: { ...target.overtime },
});

export const toProductionLiveRunChangesResult = (
  changes: ProductionLiveRunChanges,
): ProductionLiveRunChangesResult => ({
  ...changes,
  orders: changes.orders.map((order) => ({
    ...order,
    placement: toStoredPendingPlacementResult(order.placement),
    recommendedPlacement:
      order.recommendedPlacement.status === 'available'
        ? {
            status: 'available',
            placement: toLiveAutomaticPlacementResult(
              order.recommendedPlacement.placement,
            ),
          }
        : { ...order.recommendedPlacement },
    exactBatchTargets: order.exactBatchTargets.map(
      toLiveExactBatchTargetResult,
    ),
  })),
});

const toProductionDemandOutlookResult = (
  outlook: ProductionDemandOutlook,
): ProductionDemandOutlookResult => ({
  ...outlook,
  horizonCutoffAt: utcIsoFromDate(outlook.horizonCutoffAt),
  items: outlook.items.map((item) => ({
    ...item,
    dueAt: utcIsoFromDate(item.dueAt),
  })),
  forecast:
    outlook.forecast === null
      ? null
      : {
          ...outlook.forecast,
          batches: outlook.forecast.batches.map((batch) => ({
            ...batch,
            demandIds: [...batch.demandIds],
          })),
          unplacedDemandIds: [...outlook.forecast.unplacedDemandIds],
        },
});

export const toProductionWorkspaceResult = (
  workspace: ProductionWorkspaceModel,
): ProductionWorkspaceResult => ({
  location: { ...workspace.location },
  currentShift:
    workspace.currentShift === null
      ? null
      : {
          ...workspace.currentShift,
          startsAt: utcIsoFromDate(workspace.currentShift.startsAt),
          endsAt: utcIsoFromDate(workspace.currentShift.endsAt),
        },
  shiftSelection:
    workspace.shiftSelection === null
      ? null
      : {
          ...workspace.shiftSelection,
          selectedOrderIds: [...workspace.shiftSelection.selectedOrderIds],
        },
  candidateShifts: workspace.candidateShifts.map((shift) => ({
    ...shift,
    startsAt: utcIsoFromDate(shift.startsAt),
    endsAt: utcIsoFromDate(shift.endsAt),
  })),
  currentSchedulerConfig:
    workspace.currentSchedulerConfig === null
      ? null
      : {
          ...workspace.currentSchedulerConfig,
          stageFitAssertion: {
            ...workspace.currentSchedulerConfig.stageFitAssertion,
          },
        },
  currentScheduleProposal:
    workspace.currentScheduleProposal === null
      ? null
      : toScheduleProposalRepresentation(workspace.currentScheduleProposal),
  activeRuns: workspace.activeRuns.map((run) => ({
    ...run,
    plannedCompletionAt: utcIsoFromDate(run.plannedCompletionAt),
    overtimeAcknowledgement:
      run.overtimeAcknowledgement === null
        ? null
        : {
            ...run.overtimeAcknowledgement,
            acknowledgedAt: utcIsoFromDate(
              run.overtimeAcknowledgement.acknowledgedAt,
            ),
          },
  })),
  orders: workspace.orders.map(toWorkspaceProductionOrderListItem),
  pendingEligibleOrders: workspace.pendingEligibleOrders.map(
    toStoredPendingOrderResult,
  ),
  liveRunChanges:
    workspace.liveRunChanges === null
      ? null
      : toProductionLiveRunChangesResult(workspace.liveRunChanges),
  demandOutlook:
    workspace.demandOutlook === null
      ? null
      : toProductionDemandOutlookResult(workspace.demandOutlook),
  board:
    workspace.board === null
      ? null
      : toWorkspaceProductionBoardResult(workspace.board),
  stations: workspace.stations.map((station) => ({ ...station })),
  machines: workspace.machines.map((machine) => ({ ...machine })),
  asOf: utcIsoFromDate(workspace.asOf),
});
