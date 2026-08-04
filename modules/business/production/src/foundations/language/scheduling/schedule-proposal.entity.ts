import type { SchedulingOutput } from './production-scheduling.model.ts';
import type { SchedulerAlgorithmVersion } from './scheduler-config.model.ts';

export type ScheduleRevisionStatus =
  | 'draft'
  | 'accepted'
  | 'superseded'
  | 'rejected';

export type ScheduleWarningCode = SchedulingOutput['warnings'][number]['code'];

export type ScheduleWarning = Readonly<{
  code: ScheduleWarningCode;
  message: string;
  blocking: boolean;
  orderIds?: readonly string[] | undefined;
}>;

export type ProposedScheduleBatch = SchedulingOutput['batches'][number];

/**
 * Identity-bearing schedule revision whose lifecycle continues through draft,
 * acceptance, rejection, and supersession.
 *
 * Timestamp fields intentionally remain canonical ISO strings. Schedule
 * proposals cross persisted JSON snapshot and work-event replay boundaries, so
 * converting them to Date values inward would create a representation that
 * replay cannot preserve without another decoding boundary.
 */
export type ScheduleProposal = Readonly<{
  scheduleRunId: string;
  productionShiftId: string;
  schedulerConfigId: string;
  status: ScheduleRevisionStatus;
  inputSnapshotHash: string;
  outputPlanHash: string;
  algorithmVersion: SchedulerAlgorithmVersion;
  pulseMinutes: number;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  plannedCompletionAt: string;
  batches: readonly ProposedScheduleBatch[];
  unplacedOrderIds: readonly string[];
  warnings: readonly ScheduleWarning[];
  createdAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  acknowledgedWarningCodes: readonly ScheduleWarningCode[];
  supersededAt: string | null;
}>;
