export const listHistoryRunsOperationId =
  'production.list-history-runs.v1' as const;

export type HistoryRunStatus = 'started' | 'completed';

export type ListHistoryRunsInput = Readonly<{
  locationId: string;
  cursor?: string;
  limit: number;
  search?: string;
  status?: HistoryRunStatus;
  createdAfter?: Date;
}>;

export type HistoryRunPersistenceRow = Readonly<{
  id: string;
  productionShiftId: string;
  scheduleRunId: string;
  status: string;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  timezone: string;
  startedAt: Date | null;
  completedAt: Date | null;
  plannedCompletionAt: Date;
  queueVersion: number;
  overtimeAcknowledgedAt: Date | null;
  createdAt: Date;
}>;

export type HistoryRunStatistics = Readonly<{
  batchCount: number;
  completedBatchCount: number;
  orderCount: number;
  priorityOrderCount: number;
  totalWeightLbs: number;
}>;

export type HistoryRun = Readonly<{
  productionRunId: string;
  productionShiftId: string;
  scheduleRunId: string;
  status: HistoryRunStatus;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  timezone: string;
  startedAt: Date;
  completedAt: Date | null;
  plannedCompletionAt: Date;
  batchCount: number;
  completedBatchCount: number;
  orderCount: number;
  priorityOrderCount: number;
  totalWeightLbs: number;
  queueVersion: number;
  overtimeAcknowledged: boolean;
  createdAt: Date;
}>;

export type HistoryRunsPage = Readonly<{
  items: readonly HistoryRun[];
  nextCursor: string | null;
  asOf: Date;
}>;

export type ListHistoryRunsRepositoryResult =
  | Readonly<{ kind: 'found'; page: HistoryRunsPage }>
  | Readonly<{ kind: 'invalid_cursor' }>
  | Readonly<{ kind: 'location_not_found' }>;

export type ListHistoryRunsRepository = Readonly<{
  list: (
    input: ListHistoryRunsInput,
    asOf: Date,
  ) => Promise<ListHistoryRunsRepositoryResult>;
}>;

export type ListHistoryRunsClock = Readonly<{ now: () => Date }>;

export type ListHistoryRunsLocationNotFound = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'production_location_not_found';
  message: 'The production location was not found.';
  safeMessage: 'The production location was not found.';
}>;

export type ListHistoryRunsCursorInvalid = Readonly<{
  tag: 'ProductionFailure';
  kind: 'validation';
  classification: 'malformed';
  code: 'production_history_cursor_invalid';
  message: 'The production-history cursor is invalid for these filters.';
  safeMessage: 'The production-history cursor is invalid for these filters.';
}>;

export type ListHistoryRunsExpectedFailure =
  | ListHistoryRunsCursorInvalid
  | ListHistoryRunsLocationNotFound;
