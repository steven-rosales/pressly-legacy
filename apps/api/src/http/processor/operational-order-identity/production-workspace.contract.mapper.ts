import type {
  ProcessorOperationalOrderIdentity,
  ProcessorProductionWorkspace,
} from '@pressly/contracts/processor';
import { productionOrderReferenceId } from '@pressly/processor-experience';
import type { ProductionWorkspaceModel } from '@pressly/production';
import { requireOperationalOrderIdentity } from './operational-order-identity.contract.mapper.ts';
import {
  toProcessorProductionBoardContract,
  toProcessorProductionRunContract,
} from './production-board.contract.mapper.ts';

type WorkspacePendingOrder =
  ProductionWorkspaceModel['pendingEligibleOrders'][number];
type ProcessorWorkspacePendingOrder =
  ProcessorProductionWorkspace['pendingEligibleOrders'][number];
type WorkspaceLiveRunChanges = NonNullable<
  ProductionWorkspaceModel['liveRunChanges']
>;
type ProcessorWorkspaceLiveRunChanges = NonNullable<
  ProcessorProductionWorkspace['liveRunChanges']
>;

const serializeWorkspacePendingPlacement = (
  placement: WorkspacePendingOrder['placement'],
): ProcessorWorkspacePendingOrder['placement'] => {
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

const serializeWorkspacePendingOrder = (
  order: WorkspacePendingOrder,
  identity: ProcessorOperationalOrderIdentity,
): ProcessorWorkspacePendingOrder => ({
  ...order,
  placement: serializeWorkspacePendingPlacement(order.placement),
  identity,
});

type WorkspaceAutomaticPlacement = Extract<
  WorkspaceLiveRunChanges['orders'][number]['recommendedPlacement'],
  { status: 'available' }
>['placement'];
type ProcessorAutomaticPlacement = Extract<
  ProcessorWorkspaceLiveRunChanges['orders'][number]['recommendedPlacement'],
  { status: 'available' }
>['placement'];

const serializeLiveAutomaticPlacement = (
  placement: WorkspaceAutomaticPlacement,
): ProcessorAutomaticPlacement => ({
  ...placement,
  target: { ...placement.target },
  capacity: { ...placement.capacity },
  overtime: { ...placement.overtime },
  allowedActions: [...placement.allowedActions],
});

const serializeLiveExactBatchTarget = (
  placement: WorkspaceLiveRunChanges['orders'][number]['exactBatchTargets'][number],
): ProcessorWorkspaceLiveRunChanges['orders'][number]['exactBatchTargets'][number] => ({
  ...placement,
  target: { ...placement.target },
  capacity: { ...placement.capacity },
  overtime: { ...placement.overtime },
  allowedActions: [...placement.allowedActions],
});

const serializeLiveRunChanges = (
  changes: WorkspaceLiveRunChanges,
  identities: ReadonlyMap<string, ProcessorOperationalOrderIdentity>,
): ProcessorWorkspaceLiveRunChanges => ({
  ...changes,
  orders: changes.orders.map((order) => ({
    ...serializeWorkspacePendingOrder(
      order,
      requireOperationalOrderIdentity(
        identities,
        productionOrderReferenceId(order.id),
      ),
    ),
    recommendedPlacement:
      order.recommendedPlacement.status === 'unavailable'
        ? { ...order.recommendedPlacement }
        : {
            status: 'available',
            placement: serializeLiveAutomaticPlacement(
              order.recommendedPlacement.placement,
            ),
          },
    exactBatchTargets: order.exactBatchTargets.map(
      serializeLiveExactBatchTarget,
    ),
  })),
});

const serializeScheduleProposal = (
  proposal: NonNullable<ProductionWorkspaceModel['currentScheduleProposal']>,
): NonNullable<ProcessorProductionWorkspace['currentScheduleProposal']> => ({
  ...proposal,
  batches: proposal.batches.map((batch) => ({
    ...batch,
    orderIds: [...batch.orderIds],
    stages: batch.stages.map((stage) => ({
      ...stage,
      machineIds: [...stage.machineIds],
    })),
  })),
  unplacedOrderIds: [...proposal.unplacedOrderIds],
  warnings: proposal.warnings.map((warning) => ({
    code: warning.code,
    message: warning.message,
    blocking: warning.blocking,
    ...(warning.orderIds === undefined
      ? {}
      : { orderIds: [...warning.orderIds] }),
  })),
  acknowledgedWarningCodes: [...proposal.acknowledgedWarningCodes],
});

const serializeDemandOutlook = (
  outlook: NonNullable<ProductionWorkspaceModel['demandOutlook']>,
): NonNullable<ProcessorProductionWorkspace['demandOutlook']> => ({
  ...outlook,
  horizonCutoffAt: outlook.horizonCutoffAt.toISOString(),
  items: outlook.items.map((item) => ({
    ...item,
    dueAt: item.dueAt.toISOString(),
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

export const toProcessorProductionWorkspaceContract = (
  base: ProductionWorkspaceModel,
  identities: ReadonlyMap<string, ProcessorOperationalOrderIdentity>,
): ProcessorProductionWorkspace => ({
  location: { ...base.location },
  currentShift:
    base.currentShift === null
      ? null
      : {
          ...base.currentShift,
          startsAt: base.currentShift.startsAt.toISOString(),
          endsAt: base.currentShift.endsAt.toISOString(),
        },
  shiftSelection:
    base.shiftSelection === null
      ? null
      : {
          ...base.shiftSelection,
          selectedOrderIds: [...base.shiftSelection.selectedOrderIds],
        },
  candidateShifts: base.candidateShifts.map((shift) => ({
    ...shift,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
  })),
  currentSchedulerConfig:
    base.currentSchedulerConfig === null
      ? null
      : {
          ...base.currentSchedulerConfig,
          stageFitAssertion: {
            ...base.currentSchedulerConfig.stageFitAssertion,
          },
        },
  currentScheduleProposal:
    base.currentScheduleProposal === null
      ? null
      : serializeScheduleProposal(base.currentScheduleProposal),
  activeRuns: base.activeRuns.map(toProcessorProductionRunContract),
  orders: base.orders.map((order) => ({
    ...order,
    dueAt: order.dueAt.toISOString(),
    identity: requireOperationalOrderIdentity(
      identities,
      productionOrderReferenceId(order.id),
    ),
  })),
  pendingEligibleOrders: base.pendingEligibleOrders.map((order) =>
    serializeWorkspacePendingOrder(
      order,
      requireOperationalOrderIdentity(
        identities,
        productionOrderReferenceId(order.id),
      ),
    ),
  ),
  liveRunChanges:
    base.liveRunChanges === null
      ? null
      : serializeLiveRunChanges(base.liveRunChanges, identities),
  demandOutlook:
    base.demandOutlook === null
      ? null
      : serializeDemandOutlook(base.demandOutlook),
  board:
    base.board === null
      ? null
      : toProcessorProductionBoardContract(base.board, identities),
  stations: base.stations.map((station) => ({ ...station })),
  machines: base.machines.map((machine) => ({ ...machine })),
  asOf: base.asOf.toISOString(),
});
