export const listHistoryPlansOperationId =
  'production.list-history-plans.v1' as const;

export type HistoryPlanStatus =
  | 'draft'
  | 'accepted'
  | 'superseded'
  | 'rejected';

export type ListHistoryPlansInput = Readonly<{
  locationId: string;
  cursor?: string;
  limit: number;
  runId?: string;
  search?: string;
  status?: HistoryPlanStatus;
  createdAfter?: Date;
}>;

export type HistoryPlanPersistenceRow = Readonly<{
  id: string;
  productionShiftId: string;
  linkedProductionRunId: string | null;
  status: string;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  algorithmVersion: string;
  schedulerConfigId: string;
  inputSnapshotHash: string;
  outputPlanHash: string;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  plannedCompletionAt: Date;
  warnings: unknown;
  acknowledgedWarningCodes: unknown;
  createdAt: Date;
  acceptedAt: Date | null;
  acceptedBy: string | null;
  supersededAt: Date | null;
}>;

export type HistoryPlan = Readonly<{
  scheduleRunId: string;
  productionShiftId: string;
  linkedProductionRunId: string | null;
  status: HistoryPlanStatus;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  algorithmVersion: string;
  schedulerConfigId: string;
  inputSnapshotHash: string;
  outputPlanHash: string;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  plannedCompletionAt: Date;
  warningCount: number;
  acknowledgedWarningCount: number;
  createdAt: Date;
  acceptedAt: Date | null;
  acceptedBy: string | null;
  supersededAt: Date | null;
}>;

export type HistoryPlansPage = Readonly<{
  items: readonly HistoryPlan[];
  nextCursor: string | null;
  asOf: Date;
}>;

export type ListHistoryPlansRepositoryResult =
  | Readonly<{ kind: 'found'; page: HistoryPlansPage }>
  | Readonly<{ kind: 'invalid_cursor' }>
  | Readonly<{ kind: 'location_not_found' }>;

export type ListHistoryPlansRepository = Readonly<{
  list: (
    input: ListHistoryPlansInput,
    asOf: Date,
  ) => Promise<ListHistoryPlansRepositoryResult>;
}>;

export type ListHistoryPlansClock = Readonly<{ now: () => Date }>;

export type ListHistoryPlansLocationNotFound = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'production_location_not_found';
  message: 'The production location was not found.';
  safeMessage: 'The production location was not found.';
}>;

export type ListHistoryPlansCursorInvalid = Readonly<{
  tag: 'ProductionFailure';
  kind: 'validation';
  classification: 'malformed';
  code: 'production_history_cursor_invalid';
  message: 'The production-history cursor is invalid for these filters.';
  safeMessage: 'The production-history cursor is invalid for these filters.';
}>;

export type ListHistoryPlansExpectedFailure =
  | ListHistoryPlansLocationNotFound
  | ListHistoryPlansCursorInvalid;
