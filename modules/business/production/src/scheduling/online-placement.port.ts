import type { ProductionPendingOrder } from '@pressly/contracts';

export type OnlinePlacementInput = Readonly<{
  order: Readonly<{
    id: string;
    priority: boolean;
    derivedWeightLbs: number;
    bagCount: number;
    version: number;
  }>;
  run: Readonly<{
    id: string;
    queueVersion: number;
    startsAt: string;
    shiftEndsAt: string;
    pulseMinutes: number;
    pulseCapacityLbs: number;
  }>;
  machines: readonly Readonly<{
    id: string;
    stationKind: 'washing' | 'drying';
    effectiveCapacityLbs: number;
    active: boolean;
  }>[];
  batches: readonly Readonly<{
    id: string;
    sequence: number;
    status:
      | 'queued'
      | 'sorting'
      | 'washing'
      | 'drying'
      | 'folding_packaging'
      | 'finished';
    membershipFrozen: boolean;
    orderIds: readonly string[];
    priorityOrderIds: readonly string[];
    derivedWeightLbs: number;
    bagCount: number;
    stages: readonly Readonly<{
      stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
      startsAt: string;
      endsAt: string;
      machineIds: readonly string[];
    }>[];
  }>[];
  mode:
    | Readonly<{ type: 'automatic' }>
    | Readonly<{ type: 'manager_exact'; targetBatchId: string }>;
}>;

export type ProductionRunPlacementContext = Readonly<{
  input: Pick<OnlinePlacementInput, 'run' | 'machines' | 'batches'>;
  runStatus: string;
  batchVersions: Readonly<Record<string, number>>;
  assignedOrderIds: readonly string[];
}>;

export type ProductionOrderPlacementContext = Readonly<{
  input: OnlinePlacementInput;
  runStatus: string;
  orderStatus: string;
  orderExecutionStatus: string;
  orderVersion: number;
  orderAlreadyAssigned: boolean;
  batchVersions: Readonly<Record<string, number>>;
}>;

export type ProductionLiveRunPlacementOrder = Readonly<{
  order: ProductionPendingOrder;
  context: ProductionOrderPlacementContext;
}>;

export type OnlinePlacementProposal = Readonly<{
  kind: 'proposed';
  algorithmVersion: 'online-stable-insertion-v1';
  inputSnapshotHash: string;
  placementPlanHash: string;
  canonicalPlacement: string;
  expectedQueueVersion: number;
  target:
    | Readonly<{
        type: 'existing_batch';
        batchId: string;
        sequence: number;
      }>
    | Readonly<{
        type: 'new_batch';
        insertAtSequence: number;
      }>;
  affectedFromSequence: number;
  affectedBatches: readonly Readonly<{
    sourceBatchId: string | null;
    sequence: number;
    status: OnlinePlacementInput['batches'][number]['status'];
    membershipFrozen: boolean;
    orderIds: readonly string[];
    priorityOrderIds: readonly string[];
    derivedWeightLbs: number;
    bagCount: number;
    stages: OnlinePlacementInput['batches'][number]['stages'];
    changed: boolean;
  }>[];
  projectedCompletionAt: string;
  overtime: Readonly<{
    required: boolean;
    shiftEndsAt: string;
    overrunMinutes: number;
  }>;
}>;

export type OnlinePlacementResult =
  | OnlinePlacementProposal
  | Readonly<{
      kind: 'rejected';
      algorithmVersion: 'online-stable-insertion-v1';
      inputSnapshotHash: string;
      reason: Readonly<{ code: string; message: string }>;
    }>;
