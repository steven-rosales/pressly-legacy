import type { ListProductionHistoryRunsResult } from '../../../read-models/production-history/contract.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  HistoryRun,
  HistoryRunPersistenceRow,
  HistoryRunsPage,
  HistoryRunStatistics,
} from './types.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

export const emptyHistoryRunStatistics = (): HistoryRunStatistics => ({
  batchCount: 0,
  completedBatchCount: 0,
  orderCount: 0,
  priorityOrderCount: 0,
  totalWeightLbs: 0,
});

export const projectHistoryRun = (
  row: HistoryRunPersistenceRow,
  statistics: HistoryRunStatistics,
): HistoryRun => {
  if (row.status !== 'started' && row.status !== 'completed')
    throw invariant(
      'production_history_run_status_invalid',
      `Unknown production-run history status: ${row.status}.`,
    );
  if (row.startedAt === null)
    throw invariant(
      'production_history_run_start_missing',
      'Production-run history is missing its start boundary.',
    );

  return {
    productionRunId: row.id,
    productionShiftId: row.productionShiftId,
    scheduleRunId: row.scheduleRunId,
    status: row.status,
    shiftStartsAt: row.shiftStartsAt,
    shiftEndsAt: row.shiftEndsAt,
    timezone: row.timezone,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    plannedCompletionAt: row.plannedCompletionAt,
    ...statistics,
    queueVersion: row.queueVersion,
    overtimeAcknowledged: row.overtimeAcknowledgedAt !== null,
    createdAt: row.createdAt,
  };
};

export const projectHistoryRunsResult = (
  page: HistoryRunsPage,
): ListProductionHistoryRunsResult => ({
  items: page.items.map((run) => ({
    ...run,
    shiftStartsAt: run.shiftStartsAt.toISOString(),
    shiftEndsAt: run.shiftEndsAt.toISOString(),
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    plannedCompletionAt: run.plannedCompletionAt.toISOString(),
    createdAt: run.createdAt.toISOString(),
  })),
  nextCursor: page.nextCursor,
  asOf: page.asOf.toISOString(),
});
