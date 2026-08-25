import { canonicalJson } from '@pressly/codec';
import { canonicalSha256 } from '@pressly/codec/node';
import { buildFixedPulseStages } from '../fixed-pulse-planning/plan.ts';
import type {
  OnlinePlacementBatch,
  OnlinePlacementBatchProjection,
  OnlinePlacementInput,
  OnlinePlacementRejection,
  OnlinePlacementRejectionCode,
  OnlinePlacementTarget,
  ProposeOnlinePlacement,
} from './model.ts';

const algorithmVersion = 'online-stable-insertion-v1' as const;

type WorkingBatch = Omit<OnlinePlacementBatchProjection, 'changed'> &
  Readonly<{ originalSequence: number | null }>;

const isMutable = (batch: OnlinePlacementBatch): boolean =>
  batch.status === 'queued' && !batch.membershipFrozen;

const rejection = (
  inputSnapshotHash: string,
  code: OnlinePlacementRejectionCode,
  message: string,
): OnlinePlacementRejection => ({
  kind: 'rejected',
  algorithmVersion,
  inputSnapshotHash,
  reason: { code, message },
});

const toWorkingBatch = (batch: OnlinePlacementBatch): WorkingBatch => ({
  sourceBatchId: batch.id,
  sequence: batch.sequence,
  originalSequence: batch.sequence,
  status: batch.status,
  membershipFrozen: batch.membershipFrozen,
  orderIds: [...batch.orderIds],
  priorityOrderIds: [...batch.priorityOrderIds],
  derivedWeightLbs: batch.derivedWeightLbs,
  bagCount: batch.bagCount,
  stages: batch.stages.map((stage) => ({
    ...stage,
    machineIds: [...stage.machineIds],
  })),
});

const projectedCompletion = (
  batches: readonly OnlinePlacementBatchProjection[],
  fallback: string,
): string => {
  const latest = batches.reduce(
    (maximum, batch) =>
      batch.stages.reduce(
        (stageMaximum, stage) =>
          Math.max(stageMaximum, Date.parse(stage.endsAt)),
        maximum,
      ),
    Date.parse(fallback),
  );

  return new Date(latest).toISOString();
};

const orderedBatches = (
  batches: readonly OnlinePlacementBatch[],
): readonly OnlinePlacementBatch[] =>
  batches.slice().sort((left, right) => left.sequence - right.sequence);

const sequencesAreContiguous = (
  batches: readonly OnlinePlacementBatch[],
): boolean => batches.every((batch, index) => batch.sequence === index);

const earliestFeasibleBatch = (
  input: OnlinePlacementInput,
  batches: readonly OnlinePlacementBatch[],
): OnlinePlacementBatch | undefined =>
  batches.find(
    (batch) =>
      isMutable(batch) &&
      batch.derivedWeightLbs + input.order.derivedWeightLbs <=
        input.run.pulseCapacityLbs,
  );

const bestFitBatch = (
  input: OnlinePlacementInput,
  batches: readonly OnlinePlacementBatch[],
): OnlinePlacementBatch | undefined =>
  batches
    .filter(
      (batch) =>
        isMutable(batch) &&
        batch.derivedWeightLbs + input.order.derivedWeightLbs <=
          input.run.pulseCapacityLbs,
    )
    .slice()
    .sort(
      (left, right) =>
        input.run.pulseCapacityLbs -
          (left.derivedWeightLbs + input.order.derivedWeightLbs) -
          (input.run.pulseCapacityLbs -
            (right.derivedWeightLbs + input.order.derivedWeightLbs)) ||
        left.sequence - right.sequence,
    )[0];

const priorityInsertionSequence = (
  batches: readonly OnlinePlacementBatch[],
): number => {
  let lastAnchorOrPriority = -1;

  for (const [index, batch] of batches.entries())
    if (!isMutable(batch) || batch.priorityOrderIds.length > 0)
      lastAnchorOrPriority = index;

  return lastAnchorOrPriority + 1;
};

const addOrderToBatch = (
  batch: WorkingBatch,
  input: OnlinePlacementInput,
): WorkingBatch => ({
  ...batch,
  orderIds: [...batch.orderIds, input.order.id],
  priorityOrderIds: input.order.priority
    ? [...batch.priorityOrderIds, input.order.id]
    : batch.priorityOrderIds,
  derivedWeightLbs: batch.derivedWeightLbs + input.order.derivedWeightLbs,
  bagCount: batch.bagCount + input.order.bagCount,
});

const newBatch = (input: OnlinePlacementInput): WorkingBatch => ({
  sourceBatchId: null,
  sequence: -1,
  originalSequence: null,
  status: 'queued',
  membershipFrozen: false,
  orderIds: [input.order.id],
  priorityOrderIds: input.order.priority ? [input.order.id] : [],
  derivedWeightLbs: input.order.derivedWeightLbs,
  bagCount: input.order.bagCount,
  stages: [],
});

export const proposeOnlinePlacementV1: ProposeOnlinePlacement = (input) => {
  const inputSnapshotHash = canonicalSha256(input);

  if (
    !Number.isFinite(input.order.derivedWeightLbs) ||
    input.order.derivedWeightLbs <= 0
  )
    return rejection(
      inputSnapshotHash,
      'ORDER_WEIGHT_INVALID',
      'Order weight must be positive and finite.',
    );

  if (!Number.isInteger(input.order.bagCount) || input.order.bagCount < 0)
    return rejection(
      inputSnapshotHash,
      'ORDER_BAG_COUNT_INVALID',
      'Order bag count must be a nonnegative integer.',
    );

  if (
    !Number.isFinite(input.run.pulseCapacityLbs) ||
    input.run.pulseCapacityLbs <= 0
  )
    return rejection(
      inputSnapshotHash,
      'PULSE_CAPACITY_INVALID',
      'The production run must have positive pulse capacity.',
    );

  if (input.order.derivedWeightLbs > input.run.pulseCapacityLbs)
    return rejection(
      inputSnapshotHash,
      'ORDER_EXCEEDS_PULSE_CAPACITY',
      'A whole order cannot exceed the production run pulse capacity.',
    );

  const batches = orderedBatches(input.batches);

  if (!sequencesAreContiguous(batches))
    return rejection(
      inputSnapshotHash,
      'BATCH_SEQUENCE_INVALID',
      'Production batch sequences must be unique and contiguous from zero.',
    );

  let targetBatch: OnlinePlacementBatch | undefined;
  let insertAtSequence: number | undefined;

  if (input.mode.type === 'manager_exact') {
    const targetBatchId = input.mode.targetBatchId;
    targetBatch = batches.find((batch) => batch.id === targetBatchId);

    if (targetBatch === undefined)
      return rejection(
        inputSnapshotHash,
        'TARGET_BATCH_NOT_FOUND',
        'The requested production batch does not exist.',
      );

    if (!isMutable(targetBatch))
      return rejection(
        inputSnapshotHash,
        'TARGET_BATCH_NOT_MUTABLE',
        'Exact placement requires a mutable queued batch.',
      );

    if (
      targetBatch.derivedWeightLbs + input.order.derivedWeightLbs >
      input.run.pulseCapacityLbs
    )
      return rejection(
        inputSnapshotHash,
        'TARGET_BATCH_CAPACITY_EXCEEDED',
        'Exact placement cannot override hard pulse capacity.',
      );
  } else {
    targetBatch = input.order.priority
      ? earliestFeasibleBatch(input, batches)
      : bestFitBatch(input, batches);

    if (targetBatch === undefined)
      insertAtSequence = input.order.priority
        ? priorityInsertionSequence(batches)
        : batches.length;
  }

  const working = batches.map(toWorkingBatch);
  let target: OnlinePlacementTarget;
  let affectedFromSequence: number;

  if (targetBatch !== undefined) {
    const index = targetBatch.sequence;
    const workingBatch = working[index];
    if (workingBatch === undefined)
      return rejection(
        inputSnapshotHash,
        'BATCH_SEQUENCE_INVALID',
        'Production batch sequences must be unique and contiguous from zero.',
      );
    working[index] = addOrderToBatch(workingBatch, input);
    affectedFromSequence = index;
    target = {
      type: 'existing_batch',
      batchId: targetBatch.id,
      sequence: index,
    };
  } else {
    const index = insertAtSequence ?? working.length;
    working.splice(index, 0, newBatch(input));
    affectedFromSequence = index;
    target = { type: 'new_batch', insertAtSequence: index };
  }

  const projected: readonly OnlinePlacementBatchProjection[] = working.map(
    (batch, sequence) => {
      const changed =
        batch.sourceBatchId === null ||
        batch.sourceBatchId === targetBatch?.id ||
        batch.originalSequence !== sequence;

      return {
        sourceBatchId: batch.sourceBatchId,
        sequence,
        status: batch.status,
        membershipFrozen: batch.membershipFrozen,
        orderIds: batch.orderIds,
        priorityOrderIds: batch.priorityOrderIds,
        derivedWeightLbs: batch.derivedWeightLbs,
        bagCount: batch.bagCount,
        stages: changed
          ? buildFixedPulseStages({
              startsAt: input.run.startsAt,
              pulseMinutes: input.run.pulseMinutes,
              batchSequence: sequence,
              batchWeightLbs: batch.derivedWeightLbs,
              machines: input.machines,
            })
          : batch.stages,
        changed,
      };
    },
  );
  const projectedCompletionAt = projectedCompletion(
    projected,
    input.run.startsAt,
  );
  const overtimeMilliseconds = Math.max(
    0,
    Date.parse(projectedCompletionAt) - Date.parse(input.run.shiftEndsAt),
  );
  const overtime = {
    required: overtimeMilliseconds > 0,
    shiftEndsAt: input.run.shiftEndsAt,
    overrunMinutes: Math.ceil(overtimeMilliseconds / 60_000),
  };
  const affectedBatches = projected.filter(
    (batch) => batch.sequence >= affectedFromSequence,
  );
  const placement = {
    algorithmVersion,
    expectedQueueVersion: input.run.queueVersion,
    target,
    affectedFromSequence,
    affectedBatches,
    projectedCompletionAt,
    overtime,
  };
  const canonicalPlacement = canonicalJson(placement);

  return {
    kind: 'proposed',
    ...placement,
    inputSnapshotHash,
    placementPlanHash: canonicalSha256(placement),
    canonicalPlacement,
  };
};
