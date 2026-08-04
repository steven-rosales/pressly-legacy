import type { JsonObject } from '@pressly/codec';
import type { ScheduleProposal } from './schedule-proposal.entity.ts';

/** Pure JSON projection used by durable schedule replay. */
export const projectScheduleProposalJson = (
  proposal: ScheduleProposal,
): JsonObject => ({
  scheduleRunId: proposal.scheduleRunId,
  productionShiftId: proposal.productionShiftId,
  schedulerConfigId: proposal.schedulerConfigId,
  status: proposal.status,
  inputSnapshotHash: proposal.inputSnapshotHash,
  outputPlanHash: proposal.outputPlanHash,
  algorithmVersion: proposal.algorithmVersion,
  pulseMinutes: proposal.pulseMinutes,
  pulseCapacityLbs: proposal.pulseCapacityLbs,
  batchCount: proposal.batchCount,
  makespanMinutes: proposal.makespanMinutes,
  plannedCompletionAt: proposal.plannedCompletionAt,
  batches: proposal.batches.map((batch) => ({
    sequence: batch.sequence,
    orderIds: batch.orderIds,
    derivedWeightLbs: batch.derivedWeightLbs,
    bagCount: batch.bagCount,
    stages: batch.stages.map((stage) => ({
      stage: stage.stage,
      startsAt: stage.startsAt,
      endsAt: stage.endsAt,
      machineIds: stage.machineIds,
    })),
  })),
  unplacedOrderIds: proposal.unplacedOrderIds,
  warnings: proposal.warnings.map((warning) => ({
    code: warning.code,
    message: warning.message,
    blocking: warning.blocking,
    ...(warning.orderIds === undefined ? {} : { orderIds: warning.orderIds }),
  })),
  createdAt: proposal.createdAt,
  acceptedAt: proposal.acceptedAt,
  acceptedBy: proposal.acceptedBy,
  acknowledgedWarningCodes: proposal.acknowledgedWarningCodes,
  supersededAt: proposal.supersededAt,
});
