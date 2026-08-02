import type { Result } from '@pressly/kernel';
import type { ProductionPolicyRejection } from './production-policy.model.ts';

export type ProductionPlanningPolicyPort = Readonly<{
  evaluateScheduleAcceptance: (input: {
    expectedOutputPlanHash: string;
    actualOutputPlanHash: string;
    warningCodes: readonly string[];
    blockingWarningCodes: readonly string[];
    acknowledgedWarningCodes: readonly string[];
    batches: readonly Readonly<{
      weightLbs: number;
      capacityLbs: number;
      orderIds: readonly string[];
      stages: readonly Readonly<{
        stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
        startsAt: Date;
        endsAt: Date;
        pulseMinutes: number;
      }>[];
    }>[];
  }) => Result<Readonly<{ accepted: true }>, ProductionPolicyRejection>;
  evaluateCurrentPlanAcceptance: (input: {
    scheduleRunId: string;
    currentScheduleRunId: string | null;
    eligibleOrderSnapshotMatches: boolean;
  }) => Result<Readonly<{ current: true }>, ProductionPolicyRejection>;
  evaluateScheduleStart: (input: {
    scheduleRunId: string;
    status: string;
    currentScheduleRunId: string | null;
    eligibleOrderSnapshotMatches: boolean;
    productionRunExists: boolean;
    batchCount: number;
  }) => Result<Readonly<{ started: true }>, ProductionPolicyRejection>;
  evaluateShiftPlanningWindow: (input: {
    action: 'compute' | 'accept' | 'start';
    now: Date;
    startsAt: Date;
    endsAt: Date;
  }) => Result<Readonly<{ allowed: true }>, ProductionPolicyRejection>;
  evaluateBatchMembershipTransition: (input: {
    action: 'freeze' | 'unfreeze';
    batchStatus: string;
    membershipFrozen: boolean;
    authorizedAction: 'production:queue' | 'production:override';
  }) => Result<
    Readonly<{ membershipFrozen: boolean }>,
    ProductionPolicyRejection
  >;
  evaluatePlacementCommit: (input: {
    runStatus: string;
    orderStatus: string;
    orderAlreadyAssigned: boolean;
    expectedQueueVersion: number;
    actualQueueVersion: number;
    placementType: 'automatic' | 'manager_exact';
    authorizedAction: 'production:queue' | 'production:override';
    orderWeightLbs: number;
    pulseCapacityLbs: number;
    overtime: Readonly<{
      required: boolean;
      proposalHash: string;
      confirmation: Readonly<{
        proposalHash: string;
        queueVersion: number;
      }> | null;
    }>;
  }) => Result<Readonly<{ commit: true }>, ProductionPolicyRejection>;
}>;
