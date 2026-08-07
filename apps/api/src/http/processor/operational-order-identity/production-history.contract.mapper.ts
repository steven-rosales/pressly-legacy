import type {
  ProcessorListProductionHistoryActivityResult,
  ProcessorOperationalOrderIdentity,
  ProcessorProductionHistoryRunDetail,
} from '@pressly/contracts/processor';
import { productionOrderReferenceId } from '@pressly/processor-experience';
import type {
  ProductionHistoryActivityPage,
  ProductionHistoryRunDetail,
} from '@pressly/production';
import { requireOperationalOrderIdentity } from './operational-order-identity.contract.mapper.ts';

const copyHistoryActivityDetails = (
  details: ProductionHistoryActivityPage['items'][number]['details'],
) => {
  switch (details.kind) {
    case 'shift':
      return { ...details, changedFields: [...details.changedFields] };
    case 'order':
      return {
        ...details,
        releasedStages: [...details.releasedStages],
        assignedStages: [...details.assignedStages],
      };
    case 'stage':
      return { ...details, machineIds: [...details.machineIds] };
    default:
      return { ...details };
  }
};

const serializeHistoryActivity = (
  item: ProductionHistoryActivityPage['items'][number],
) => ({
  ...item,
  details: copyHistoryActivityDetails(item.details),
  occurredAt: item.occurredAt.toISOString(),
});

export const toProcessorProductionHistoryRunContract = (
  base: ProductionHistoryRunDetail,
  identities: ReadonlyMap<string, ProcessorOperationalOrderIdentity>,
): ProcessorProductionHistoryRunDetail => ({
  overview: {
    ...base.overview,
    shiftStartsAt: base.overview.shiftStartsAt.toISOString(),
    shiftEndsAt: base.overview.shiftEndsAt.toISOString(),
    startedAt: base.overview.startedAt.toISOString(),
    completedAt: base.overview.completedAt?.toISOString() ?? null,
    plannedCompletionAt: base.overview.plannedCompletionAt.toISOString(),
    createdAt: base.overview.createdAt.toISOString(),
  },
  batches: base.batches.map((batch) => ({
    ...batch,
    startedAt: batch.startedAt?.toISOString() ?? null,
    finishedAt: batch.finishedAt?.toISOString() ?? null,
  })),
  orderMemberships: base.orderMemberships.map((membership) => ({
    ...membership,
    placement:
      membership.placement.state === 'current'
        ? {
            ...membership.placement,
            placedAt: membership.placement.placedAt.toISOString(),
          }
        : {
            ...membership.placement,
            placedAt: membership.placement.placedAt.toISOString(),
            releasedAt: membership.placement.releasedAt?.toISOString() ?? null,
          },
    identity: requireOperationalOrderIdentity(
      identities,
      productionOrderReferenceId(membership.productionOrderId),
    ),
  })),
  stageProgress: {
    ...base.stageProgress,
    items: base.stageProgress.items.map((stage) => ({
      ...stage,
      plannedStartAt: stage.plannedStartAt.toISOString(),
      plannedEndAt: stage.plannedEndAt.toISOString(),
      actualStartAt: stage.actualStartAt?.toISOString() ?? null,
      actualEndAt: stage.actualEndAt?.toISOString() ?? null,
    })),
  },
  scheduleLineage: {
    ...base.scheduleLineage,
    revisions: base.scheduleLineage.revisions.map((plan) => ({
      ...plan,
      shiftStartsAt: plan.shiftStartsAt.toISOString(),
      shiftEndsAt: plan.shiftEndsAt.toISOString(),
      plannedCompletionAt: plan.plannedCompletionAt.toISOString(),
      createdAt: plan.createdAt.toISOString(),
      acceptedAt: plan.acceptedAt?.toISOString() ?? null,
      supersededAt: plan.supersededAt?.toISOString() ?? null,
    })),
  },
  activity: {
    ...base.activity,
    items: base.activity.items.map(serializeHistoryActivity),
  },
  asOf: base.asOf.toISOString(),
});

export const toProcessorProductionHistoryActivityContract = (
  base: ProductionHistoryActivityPage,
  identities: ReadonlyMap<string, ProcessorOperationalOrderIdentity>,
): ProcessorListProductionHistoryActivityResult => ({
  ...base,
  items: base.items.map((item) => ({
    ...serializeHistoryActivity(item),
    identity:
      item.entityType === 'production_order'
        ? requireOperationalOrderIdentity(
            identities,
            productionOrderReferenceId(item.entityId),
          )
        : null,
  })),
  asOf: base.asOf.toISOString(),
});
