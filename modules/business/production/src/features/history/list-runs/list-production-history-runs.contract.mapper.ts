export {
  listProductionHistoryRunsQuerySchema,
  listProductionHistoryRunsResultSchema,
  productionHistoryLocationParamsSchema,
} from '@pressly/contracts/production';
import type { ListProductionHistoryRunsResult } from '@pressly/contracts/production';
import { utcIsoFromDate } from '@pressly/time';
import type { ProductionHistoryRunsPage } from './list-production-history-runs.model.ts';

export const toListProductionHistoryRunsResult = (
  page: ProductionHistoryRunsPage,
): ListProductionHistoryRunsResult => ({
  items: page.items.map((run) => ({
    ...run,
    shiftStartsAt: utcIsoFromDate(run.shiftStartsAt),
    shiftEndsAt: utcIsoFromDate(run.shiftEndsAt),
    startedAt: utcIsoFromDate(run.startedAt),
    completedAt:
      run.completedAt === null ? null : utcIsoFromDate(run.completedAt),
    plannedCompletionAt: utcIsoFromDate(run.plannedCompletionAt),
    createdAt: utcIsoFromDate(run.createdAt),
  })),
  nextCursor: page.nextCursor,
  asOf: utcIsoFromDate(page.asOf),
});
