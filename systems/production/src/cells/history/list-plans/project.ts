import type { ListProductionHistoryPlansResult } from '../../../read-models/production-history/contract.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  HistoryPlan,
  HistoryPlanPersistenceRow,
  HistoryPlansPage,
  HistoryPlanStatus,
} from './types.ts';

const historyInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const planStatus = (value: string): HistoryPlanStatus => {
  if (
    value === 'draft' ||
    value === 'accepted' ||
    value === 'superseded' ||
    value === 'rejected'
  )
    return value;

  throw historyInvariantViolation(
    'production_history_schedule_status_invalid',
    `Unknown schedule history status: ${value}.`,
  );
};

const arrayLength = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

export const projectHistoryPlan = (
  row: HistoryPlanPersistenceRow,
): HistoryPlan => ({
  scheduleRunId: row.id,
  productionShiftId: row.productionShiftId,
  linkedProductionRunId: row.linkedProductionRunId,
  status: planStatus(row.status),
  shiftStartsAt: row.shiftStartsAt,
  shiftEndsAt: row.shiftEndsAt,
  algorithmVersion: row.algorithmVersion,
  schedulerConfigId: row.schedulerConfigId,
  inputSnapshotHash: row.inputSnapshotHash,
  outputPlanHash: row.outputPlanHash,
  pulseCapacityLbs: row.pulseCapacityLbs,
  batchCount: row.batchCount,
  makespanMinutes: row.makespanMinutes,
  plannedCompletionAt: row.plannedCompletionAt,
  warningCount: arrayLength(row.warnings),
  acknowledgedWarningCount: arrayLength(row.acknowledgedWarningCodes),
  createdAt: row.createdAt,
  acceptedAt: row.acceptedAt,
  acceptedBy: row.acceptedBy,
  supersededAt: row.supersededAt,
});

export const projectHistoryPlansResult = (
  page: HistoryPlansPage,
): ListProductionHistoryPlansResult => ({
  items: page.items.map((plan) => ({
    ...plan,
    shiftStartsAt: plan.shiftStartsAt.toISOString(),
    shiftEndsAt: plan.shiftEndsAt.toISOString(),
    plannedCompletionAt: plan.plannedCompletionAt.toISOString(),
    createdAt: plan.createdAt.toISOString(),
    acceptedAt: plan.acceptedAt?.toISOString() ?? null,
    supersededAt: plan.supersededAt?.toISOString() ?? null,
  })),
  nextCursor: page.nextCursor,
  asOf: page.asOf.toISOString(),
});
