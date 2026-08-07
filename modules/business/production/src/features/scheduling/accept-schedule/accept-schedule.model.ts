import type { ScheduleWarningCode } from '../../../foundations/language/scheduling/schedule-proposal.entity.ts';

export type AcceptScheduleCommand = Readonly<{
  locationId: string;
  scheduleRunId: string;
  expectedOutputPlanHash: string;
  acknowledgedWarningCodes: readonly ScheduleWarningCode[];
  idempotencyKey: string;
  actorId: string;
}>;

/** Persisted work-event results retain canonical JSON timestamp strings. */
export type AcceptScheduleResult = Readonly<{
  scheduleRunId: string;
  productionShiftId: string;
  acceptedAt: string;
  replayed: boolean;
}>;
