export type OrderRoutingStage =
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging';

export type OrderRoutingPolicyInput = Readonly<{
  command: 'queued_rebatch' | 'defer_or_rework';
  order: Readonly<{ productionOrderId: string; weightLbs: number }>;
  source: Readonly<{
    productionBatchId: string;
    sequence: number;
    status:
      | 'queued'
      | 'sorting'
      | 'washing'
      | 'drying'
      | 'folding_packaging'
      | 'finished';
    membershipFrozen: boolean;
  }>;
  currentStage: OrderRoutingStage;
  restartStage: OrderRoutingStage;
  targetCandidates: readonly Readonly<{
    productionBatchId: string;
    sequence: number;
    status:
      | 'queued'
      | 'sorting'
      | 'washing'
      | 'drying'
      | 'folding_packaging'
      | 'finished';
    membershipFrozen: boolean;
    stages: readonly Readonly<{
      stage: OrderRoutingStage;
      status: 'planned' | 'started' | 'completed';
      assignedWeightLbs: number;
      capacityLbs: number;
    }>[];
  }>[];
}>;

export type OrderRoutingRejectionCode =
  | 'ORDER_WEIGHT_INVALID'
  | 'SOURCE_BATCH_INVALID'
  | 'QUEUED_REBATCH_SOURCE_NOT_QUEUED'
  | 'QUEUED_REBATCH_SOURCE_FROZEN'
  | 'EXCEPTION_SOURCE_NOT_IN_FLIGHT'
  | 'SOURCE_CURRENT_STAGE_MISMATCH'
  | 'RESTART_STAGE_SKIPS_REQUIRED_WORK'
  | 'TARGET_STAGE_GRAPH_INVALID'
  | 'NO_LATER_TARGET'
  | 'NO_FEASIBLE_TARGET'
  | 'HARD_CAPACITY_EXCEEDED';

export type OrderRoutingPolicyDecision =
  | Readonly<{
      decision: 'rejected';
      command: OrderRoutingPolicyInput['command'];
      reason: Readonly<{
        code: OrderRoutingRejectionCode;
        message: string;
      }>;
    }>
  | Readonly<{
      decision: 'accepted';
      command: OrderRoutingPolicyInput['command'];
      wholeOrder: Readonly<{
        productionOrderId: string;
        weightLbs: number;
      }>;
      route: Readonly<{
        sourceProductionBatchId: string;
        sourceSequence: number;
        targetProductionBatchId: string;
        targetSequence: number;
        currentStage: OrderRoutingStage;
        restartStage: OrderRoutingStage;
        releasedUnfinishedStages: readonly OrderRoutingStage[];
        reworkStages: readonly OrderRoutingStage[];
        targetAssignments: readonly Readonly<{
          stage: OrderRoutingStage;
          sourceDisposition:
            | 'release_unfinished'
            | 'preserve_completed_for_rework';
          assignedWeightBeforeLbs: number;
          assignedWeightAfterLbs: number;
          capacityLbs: number;
        }>[];
      }>;
    }>;

export type QueuedMoveTargetPolicyDecision =
  | Readonly<{ decision: 'allowed' }>
  | Readonly<{
      decision: 'blocked';
      code:
        | 'TARGET_IS_SOURCE_BATCH'
        | 'TARGET_NOT_QUEUED'
        | 'TARGET_MEMBERSHIP_FROZEN'
        | 'TARGET_STAGE_GRAPH_INVALID'
        | 'TARGET_STAGE_NOT_PLANNED'
        | 'HARD_CAPACITY_EXCEEDED';
    }>;

export type ProductionOrderRoutingPolicyPort = Readonly<{
  evaluateOrderRouting: (
    input: OrderRoutingPolicyInput,
  ) => OrderRoutingPolicyDecision;
  evaluateQueuedMoveTarget: (input: {
    sourceProductionBatchId: string;
    orderWeightLbs: number;
    target: OrderRoutingPolicyInput['targetCandidates'][number];
  }) => QueuedMoveTargetPolicyDecision;
}>;
