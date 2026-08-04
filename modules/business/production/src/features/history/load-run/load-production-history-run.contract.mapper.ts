export {
  productionHistoryRunDetailSchema,
  productionHistoryRunParamsSchema,
} from '@pressly/contracts/production';
import type { ProductionHistoryRunDetail as ProductionHistoryRunWireDetail } from '@pressly/contracts/production';
import { utcIsoFromDate } from '@pressly/time';
import { copyProductionHistoryActivityDetails } from '../../../foundations/adapters/postgres/history/production-history-activity.persistence.mapper.ts';
import type {
  ProductionHistoryActivityEntry,
  ProductionHistoryBatchSummary,
  ProductionHistoryOrderMembership,
  ProductionHistoryPlanSummary,
  ProductionHistoryRunDetail,
  ProductionHistoryRunSummary,
  ProductionHistoryStageProgress,
} from '../../../foundations/language/history/production-history.model.ts';

const toRunSummary = (run: ProductionHistoryRunSummary) => ({
  ...run,
  shiftStartsAt: utcIsoFromDate(run.shiftStartsAt),
  shiftEndsAt: utcIsoFromDate(run.shiftEndsAt),
  startedAt: utcIsoFromDate(run.startedAt),
  completedAt:
    run.completedAt === null ? null : utcIsoFromDate(run.completedAt),
  plannedCompletionAt: utcIsoFromDate(run.plannedCompletionAt),
  createdAt: utcIsoFromDate(run.createdAt),
});

const toBatchSummary = (batch: ProductionHistoryBatchSummary) => ({
  ...batch,
  startedAt: batch.startedAt === null ? null : utcIsoFromDate(batch.startedAt),
  finishedAt:
    batch.finishedAt === null ? null : utcIsoFromDate(batch.finishedAt),
});

const toStageProgress = (stage: ProductionHistoryStageProgress) => ({
  ...stage,
  plannedStartAt: utcIsoFromDate(stage.plannedStartAt),
  plannedEndAt: utcIsoFromDate(stage.plannedEndAt),
  actualStartAt:
    stage.actualStartAt === null ? null : utcIsoFromDate(stage.actualStartAt),
  actualEndAt:
    stage.actualEndAt === null ? null : utcIsoFromDate(stage.actualEndAt),
});

const toOrderMembership = (membership: ProductionHistoryOrderMembership) => ({
  ...membership,
  placement:
    membership.placement.state === 'current'
      ? {
          ...membership.placement,
          placedAt: utcIsoFromDate(membership.placement.placedAt),
        }
      : {
          ...membership.placement,
          placedAt: utcIsoFromDate(membership.placement.placedAt),
          releasedAt:
            membership.placement.releasedAt === null
              ? null
              : utcIsoFromDate(membership.placement.releasedAt),
        },
});

const toPlanSummary = (plan: ProductionHistoryPlanSummary) => ({
  ...plan,
  shiftStartsAt: utcIsoFromDate(plan.shiftStartsAt),
  shiftEndsAt: utcIsoFromDate(plan.shiftEndsAt),
  plannedCompletionAt: utcIsoFromDate(plan.plannedCompletionAt),
  createdAt: utcIsoFromDate(plan.createdAt),
  acceptedAt: plan.acceptedAt === null ? null : utcIsoFromDate(plan.acceptedAt),
  supersededAt:
    plan.supersededAt === null ? null : utcIsoFromDate(plan.supersededAt),
});

const toActivityEntry = (entry: ProductionHistoryActivityEntry) => ({
  ...entry,
  details: copyProductionHistoryActivityDetails(entry.details),
  occurredAt: utcIsoFromDate(entry.occurredAt),
});

export const toProductionHistoryRunDetailResult = (
  detail: ProductionHistoryRunDetail,
): ProductionHistoryRunWireDetail => ({
  overview: toRunSummary(detail.overview),
  batches: detail.batches.map(toBatchSummary),
  orderMemberships: detail.orderMemberships.map(toOrderMembership),
  stageProgress: {
    ...detail.stageProgress,
    items: detail.stageProgress.items.map(toStageProgress),
  },
  scheduleLineage: {
    ...detail.scheduleLineage,
    revisions: detail.scheduleLineage.revisions.map(toPlanSummary),
  },
  activity: {
    ...detail.activity,
    items: detail.activity.items.map(toActivityEntry),
  },
  asOf: utcIsoFromDate(detail.asOf),
});
