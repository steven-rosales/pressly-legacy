import type { PolicyDecision } from './policy-decision.port.ts';

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
  }) => PolicyDecision<Readonly<{ accepted: true }>>;
  evaluateCurrentPlanAcceptance: (input: {
    scheduleRunId: string;
    currentScheduleRunId: string | null;
    eligibleOrderSnapshotMatches: boolean;
  }) => PolicyDecision<Readonly<{ current: true }>>;
  evaluateScheduleStart: (input: {
    scheduleRunId: string;
    status: string;
    currentScheduleRunId: string | null;
    eligibleOrderSnapshotMatches: boolean;
    productionRunExists: boolean;
    batchCount: number;
  }) => PolicyDecision<Readonly<{ started: true }>>;
  evaluateShiftPlanningWindow: (input: {
    action: 'compute' | 'accept' | 'start';
    now: Date;
    startsAt: Date;
    endsAt: Date;
  }) => PolicyDecision<Readonly<{ allowed: true }>>;
  evaluateBatchMembershipTransition: (input: {
    action: 'freeze' | 'unfreeze';
    batchStatus: string;
    membershipFrozen: boolean;
    authorizedAction: 'production:queue' | 'production:override';
  }) => PolicyDecision<Readonly<{ membershipFrozen: boolean }>>;
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
  }) => PolicyDecision<Readonly<{ commit: true }>>;
}>;
