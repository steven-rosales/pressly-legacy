export type ProductionHistoryRunRow = Readonly<{
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

export type ProductionHistoryRunStatistics = Readonly<{
  batchCount: number;
  completedBatchCount: number;
  orderCount: number;
  priorityOrderCount: number;
  totalWeightLbs: number;
}>;

export type ProductionHistoryPlanRow = Readonly<{
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

export type ProductionHistoryActivityRow = Readonly<{
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorDisplayName: string | null;
  expectedVersion: number | null;
  payload: unknown;
  createdAt: Date;
  currentResolutionState?: string | null;
  currentProductionVersion?: number | null;
}>;

export type ProductionHistoryBatchRow = Readonly<{
  id: string;
  sequence: number;
  status: string;
  derivedWeightLbs: number;
  pulseCapacityLbs: number;
  currentOrderCount: number;
  historicalOrderCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
}>;

export type ProductionHistoryStageRow = Readonly<{
  stageRunId: string;
  productionBatchId: string;
  batchSequence: number;
  stage: string;
  status: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  actualStartProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  actualEndProvenance: 'live_observed' | 'operator_reported' | 'not_recorded';
  startedBy: string | null;
  completedBy: string | null;
  machineCount: number;
}>;

export type ProductionHistoryOrderMembershipRow = Readonly<{
  membershipId: string;
  productionOrderId: string;
  externalOrderId: string;
  orderStatus: string;
  derivedWeightLbs: number;
  bagCount: number | null;
  productionBatchId: string;
  batchSequence: number;
  placementProvenance: string;
  active: boolean;
  placedAt: Date;
  placedBy: string | null;
  releasedAt: Date | null;
  releasedBy: string | null;
  releaseReason: string | null;
}>;
