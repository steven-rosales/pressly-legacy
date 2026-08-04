export type OnlinePlacementAlgorithmVersion = 'online-stable-insertion-v1';

export type OnlinePlacementStageKind =
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging';

export type OnlinePlacementStage = Readonly<{
  stage: OnlinePlacementStageKind;
  startsAt: string;
  endsAt: string;
  machineIds: readonly string[];
}>;

export type OnlinePlacementMachine = Readonly<{
  id: string;
  stationKind: 'washing' | 'drying';
  effectiveCapacityLbs: number;
  active: boolean;
}>;

export type OnlinePlacementBatchStatus =
  | 'queued'
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging'
  | 'finished';

export type OnlinePlacementOrder = Readonly<{
  id: string;
  priority: boolean;
  derivedWeightLbs: number;
  bagCount: number;
  version: number;
}>;

export type OnlinePlacementBatchInput = Readonly<{
  id: string;
  sequence: number;
  status: OnlinePlacementBatchStatus;
  membershipFrozen: boolean;
  orderIds: readonly string[];
  priorityOrderIds: readonly string[];
  derivedWeightLbs: number;
  bagCount: number;
  stages: readonly OnlinePlacementStage[];
}>;

export type OnlinePlacementMode =
  | Readonly<{ type: 'automatic' }>
  | Readonly<{ type: 'manager_exact'; targetBatchId: string }>;

export type OnlinePlacementInput = Readonly<{
  order: OnlinePlacementOrder;
  run: Readonly<{
    id: string;
    queueVersion: number;
    startsAt: string;
    shiftEndsAt: string;
    pulseMinutes: number;
    pulseCapacityLbs: number;
  }>;
  machines: readonly OnlinePlacementMachine[];
  batches: readonly OnlinePlacementBatchInput[];
  mode: OnlinePlacementMode;
}>;

export type OnlinePlacementTarget =
  | Readonly<{
      type: 'existing_batch';
      batchId: string;
      sequence: number;
    }>
  | Readonly<{
      type: 'new_batch';
      insertAtSequence: number;
    }>;

export type OnlinePlacementBatchProjection = Readonly<{
  sourceBatchId: string | null;
  sequence: number;
  status: OnlinePlacementBatchStatus;
  membershipFrozen: boolean;
  orderIds: readonly string[];
  priorityOrderIds: readonly string[];
  derivedWeightLbs: number;
  bagCount: number;
  stages: readonly OnlinePlacementStage[];
  changed: boolean;
}>;

export type OnlinePlacementRejectionCode =
  | 'ORDER_WEIGHT_INVALID'
  | 'ORDER_BAG_COUNT_INVALID'
  | 'PULSE_CAPACITY_INVALID'
  | 'ORDER_EXCEEDS_PULSE_CAPACITY'
  | 'BATCH_SEQUENCE_INVALID'
  | 'TARGET_BATCH_NOT_FOUND'
  | 'TARGET_BATCH_NOT_MUTABLE'
  | 'TARGET_BATCH_CAPACITY_EXCEEDED';

export type OnlinePlacementRejection = Readonly<{
  kind: 'rejected';
  algorithmVersion: OnlinePlacementAlgorithmVersion;
  inputSnapshotHash: string;
  reason: Readonly<{
    code: OnlinePlacementRejectionCode;
    message: string;
  }>;
}>;

export type OnlinePlacementProposal = Readonly<{
  kind: 'proposed';
  algorithmVersion: OnlinePlacementAlgorithmVersion;
  inputSnapshotHash: string;
  placementPlanHash: string;
  canonicalPlacement: string;
  expectedQueueVersion: number;
  target: OnlinePlacementTarget;
  affectedFromSequence: number;
  affectedBatches: readonly OnlinePlacementBatchProjection[];
  projectedCompletionAt: string;
  overtime: Readonly<{
    required: boolean;
    shiftEndsAt: string;
    overrunMinutes: number;
  }>;
}>;

export type OnlinePlacementResult =
  | OnlinePlacementProposal
  | OnlinePlacementRejection;

export type ProposeOnlinePlacement = (
  input: OnlinePlacementInput,
) => OnlinePlacementResult;
