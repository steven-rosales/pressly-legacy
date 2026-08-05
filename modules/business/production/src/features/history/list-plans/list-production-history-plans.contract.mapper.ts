import type { ListProductionHistoryPlansResult } from '@pressly/contracts/production';
import { utcIsoFromDate } from '@pressly/time';
import type { ProductionHistoryPlansPage } from './list-production-history-plans.model.ts';

export const toListProductionHistoryPlansResult = (
  page: ProductionHistoryPlansPage,
): ListProductionHistoryPlansResult => ({
  items: page.items.map((plan) => ({
    ...plan,
    shiftStartsAt: utcIsoFromDate(plan.shiftStartsAt),
    shiftEndsAt: utcIsoFromDate(plan.shiftEndsAt),
    plannedCompletionAt: utcIsoFromDate(plan.plannedCompletionAt),
    createdAt: utcIsoFromDate(plan.createdAt),
    acceptedAt:
      plan.acceptedAt === null ? null : utcIsoFromDate(plan.acceptedAt),
    supersededAt:
      plan.supersededAt === null ? null : utcIsoFromDate(plan.supersededAt),
  })),
  nextCursor: page.nextCursor,
  asOf: utcIsoFromDate(page.asOf),
});
