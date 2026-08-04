export type StartScheduleCommand = Readonly<{
  locationId: string;
  scheduleRunId: string;
  expectedOutputPlanHash: string;
  idempotencyKey: string;
  actorId: string;
}>;

/** Persisted work-event results retain canonical JSON timestamp strings. */
export type StartScheduleResult = Readonly<{
  scheduleRunId: string;
  productionRunId: string;
  productionBatchIds: readonly string[];
  queueVersion: number;
  startedAt: string;
  replayed: boolean;
}>;
