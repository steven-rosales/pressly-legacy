import { describe, expect, it } from 'vitest';
import { proposeOnlinePlacement } from '../../../../src/foundations/algorithms/online-stable-insertion-v1/online-placement.algorithm.ts';
import type {
  OnlinePlacementBatchInput,
  OnlinePlacementInput,
} from '../../../../src/foundations/algorithms/online-stable-insertion-v1/online-placement.model.ts';
import type { ProposedStage } from '../../../../src/foundations/algorithms/fixed-pulse-ffd-v2/propose-schedule.model.ts';

const startsAt = '2026-07-10T08:00:00.000Z';
const stages = (sequence: number, marker = ''): readonly ProposedStage[] =>
  (['sorting', 'washing', 'drying', 'folding_packaging'] as const).map(
    (stage, stageIndex) => ({
      stage,
      startsAt: new Date(
        Date.parse(startsAt) + (sequence + stageIndex) * 60 * 60_000,
      ).toISOString(),
      endsAt: new Date(
        Date.parse(startsAt) + (sequence + stageIndex + 1) * 60 * 60_000,
      ).toISOString(),
      machineIds:
        stage === 'washing' || stage === 'drying'
          ? [`${stage}-machine${marker}`]
          : [],
    }),
  );

const batch = (
  sequence: number,
  weight: number,
  options: Readonly<{
    frozen?: boolean;
    priority?: boolean;
    status?: OnlinePlacementBatchInput['status'];
    marker?: string;
  }> = {},
): OnlinePlacementBatchInput => ({
  id: `batch-${sequence}`,
  sequence,
  status: options.status ?? 'queued',
  membershipFrozen: options.frozen ?? false,
  orderIds: [`existing-${sequence}`],
  priorityOrderIds: options.priority ? [`existing-${sequence}`] : [],
  derivedWeightLbs: weight,
  bagCount: 1,
  stages: stages(sequence, options.marker),
});

const input = (
  batches: readonly OnlinePlacementBatchInput[],
  overrides: Partial<OnlinePlacementInput> = {},
): OnlinePlacementInput => ({
  order: {
    id: 'arriving-order',
    priority: false,
    derivedWeightLbs: 30,
    bagCount: 2,
    version: 1,
  },
  run: {
    id: 'run-1',
    queueVersion: 7,
    startsAt,
    shiftEndsAt: '2026-07-10T18:00:00.000Z',
    pulseMinutes: 60,
    pulseCapacityLbs: 100,
  },
  machines: [
    {
      id: 'washer-1',
      stationKind: 'washing',
      effectiveCapacityLbs: 100,
      active: true,
    },
    {
      id: 'dryer-1',
      stationKind: 'drying',
      effectiveCapacityLbs: 100,
      active: true,
    },
  ],
  batches,
  mode: { type: 'automatic' },
  ...overrides,
});

const expectProposed = (result: ReturnType<typeof proposeOnlinePlacement>) => {
  expect(result.kind).toBe('proposed');
  if (result.kind !== 'proposed') throw new Error(result.reason.code);
  return result;
};

describe('online-stable-insertion-v1', () => {
  it('places priority work in the earliest feasible mutable batch', () => {
    const original = [
      batch(0, 90, { frozen: true, marker: '-anchor' }),
      batch(1, 30),
      batch(2, 60),
    ];
    const proposal = expectProposed(
      proposeOnlinePlacement({
        ...input(original),
        order: {
          ...input([]).order,
          priority: true,
          derivedWeightLbs: 40,
        },
      }),
    );

    expect(proposal.target).toEqual({
      type: 'existing_batch',
      batchId: 'batch-1',
      sequence: 1,
    });
    expect(proposal.affectedBatches[0]).toMatchObject({
      sourceBatchId: 'batch-1',
      orderIds: ['existing-1', 'arriving-order'],
      priorityOrderIds: ['arriving-order'],
      derivedWeightLbs: 70,
      changed: true,
    });
    expect(proposal.affectedBatches[1]).toMatchObject({
      sourceBatchId: 'batch-2',
      orderIds: ['existing-2'],
      changed: false,
    });
  });

  it('creates priority work after all anchors and priority work without moving memberships', () => {
    const original = [
      batch(0, 100, { status: 'sorting', frozen: true }),
      batch(1, 100, { priority: true }),
      batch(2, 100),
      batch(3, 100, { frozen: true, marker: '-frozen' }),
      batch(4, 100),
    ];
    const proposal = expectProposed(
      proposeOnlinePlacement({
        ...input(original),
        order: { ...input([]).order, priority: true },
      }),
    );

    expect(proposal.target).toEqual({
      type: 'new_batch',
      insertAtSequence: 4,
    });
    expect(
      proposal.affectedBatches.map((candidate) => candidate.sourceBatchId),
    ).toEqual([null, 'batch-4']);
    expect(proposal.affectedBatches[0]).toMatchObject({
      sequence: 4,
      orderIds: ['arriving-order'],
      changed: true,
    });
    expect(proposal.affectedBatches[1]).toMatchObject({
      sequence: 5,
      orderIds: ['existing-4'],
      changed: true,
    });
    expect(original.map((candidate) => candidate.orderIds)).toEqual([
      ['existing-0'],
      ['existing-1'],
      ['existing-2'],
      ['existing-3'],
      ['existing-4'],
    ]);
  });

  it('uses ordinary best fit and breaks equal fits by earliest sequence', () => {
    const proposal = expectProposed(
      proposeOnlinePlacement(input([batch(0, 50), batch(1, 60), batch(2, 60)])),
    );

    expect(proposal.target).toEqual({
      type: 'existing_batch',
      batchId: 'batch-1',
      sequence: 1,
    });
    expect(proposal.affectedBatches[0]?.derivedWeightLbs).toBe(90);
  });

  it('appends an ordinary order when no mutable batch fits', () => {
    const proposal = expectProposed(
      proposeOnlinePlacement(input([batch(0, 80), batch(1, 75)])),
    );

    expect(proposal.target).toEqual({
      type: 'new_batch',
      insertAtSequence: 2,
    });
    expect(proposal.affectedBatches).toHaveLength(1);
    expect(proposal.affectedBatches[0]).toMatchObject({
      sourceBatchId: null,
      sequence: 2,
      orderIds: ['arriving-order'],
    });
  });

  it('honors exact mutable placement', () => {
    const batches = [batch(0, 10), batch(1, 60)];
    const placed = expectProposed(
      proposeOnlinePlacement({
        ...input(batches),
        mode: { type: 'manager_exact', targetBatchId: 'batch-0' },
      }),
    );
    expect(placed.target).toEqual({
      type: 'existing_batch',
      batchId: 'batch-0',
      sequence: 0,
    });
  });

  it('rejects an exact frozen-batch target', () => {
    expect(
      proposeOnlinePlacement({
        ...input([batch(0, 10, { frozen: true })]),
        mode: { type: 'manager_exact', targetBatchId: 'batch-0' },
      }),
    ).toMatchObject({
      kind: 'rejected',
      reason: { code: 'TARGET_BATCH_NOT_MUTABLE' },
    });
  });

  it('rejects an exact non-queued target', () => {
    expect(
      proposeOnlinePlacement({
        ...input([batch(0, 10, { status: 'sorting' })]),
        mode: { type: 'manager_exact', targetBatchId: 'batch-0' },
      }),
    ).toMatchObject({
      kind: 'rejected',
      reason: { code: 'TARGET_BATCH_NOT_MUTABLE' },
    });
  });

  it('rejects an exact target that would exceed hard capacity', () => {
    expect(
      proposeOnlinePlacement({
        ...input([batch(0, 80)]),
        mode: { type: 'manager_exact', targetBatchId: 'batch-0' },
      }),
    ).toMatchObject({
      kind: 'rejected',
      reason: { code: 'TARGET_BATCH_CAPACITY_EXCEEDED' },
    });
  });

  it('rejects an exact target that is missing from the run', () => {
    const batches = [batch(0, 10), batch(1, 60)];
    expect(
      proposeOnlinePlacement({
        ...input(batches),
        mode: { type: 'manager_exact', targetBatchId: 'missing' },
      }),
    ).toMatchObject({
      kind: 'rejected',
      reason: { code: 'TARGET_BATCH_NOT_FOUND' },
    });
  });

  it('never changes frozen stage windows when placing into an earlier batch', () => {
    const frozen = batch(1, 100, { frozen: true, marker: '-do-not-change' });
    const proposal = expectProposed(
      proposeOnlinePlacement({
        ...input([batch(0, 20), frozen]),
        order: { ...input([]).order, priority: true },
      }),
    );
    const projectedFrozen = proposal.affectedBatches.find(
      (candidate) => candidate.sourceBatchId === frozen.id,
    );

    expect(projectedFrozen).toMatchObject({ changed: false });
    expect(projectedFrozen?.stages).toEqual(frozen.stages);
  });

  it('returns a deterministic queue-version-bound hash and overtime projection', () => {
    const candidate = input([batch(0, 100), batch(1, 100), batch(2, 100)], {
      run: {
        ...input([]).run,
        shiftEndsAt: '2026-07-10T14:00:00.000Z',
      },
    });
    const first = expectProposed(proposeOnlinePlacement(candidate));
    const second = expectProposed(proposeOnlinePlacement(candidate));
    const changedVersion = expectProposed(
      proposeOnlinePlacement({
        ...candidate,
        run: { ...candidate.run, queueVersion: candidate.run.queueVersion + 1 },
      }),
    );

    expect(first.projectedCompletionAt).toBe('2026-07-10T15:00:00.000Z');
    expect(first.overtime).toEqual({
      required: true,
      shiftEndsAt: '2026-07-10T14:00:00.000Z',
      overrunMinutes: 60,
    });
    expect(first.canonicalPlacement).toBe(second.canonicalPlacement);
    expect(first.placementPlanHash).toBe(second.placementPlanHash);
    expect(first.placementPlanHash).not.toBe(changedVersion.placementPlanHash);
  });

  it('rejects oversized work and malformed queue sequences', () => {
    expect(
      proposeOnlinePlacement({
        ...input([]),
        order: { ...input([]).order, derivedWeightLbs: 101 },
      }),
    ).toMatchObject({
      kind: 'rejected',
      reason: { code: 'ORDER_EXCEEDS_PULSE_CAPACITY' },
    });
    expect(
      proposeOnlinePlacement(input([{ ...batch(0, 20), sequence: 1 }])),
    ).toMatchObject({
      kind: 'rejected',
      reason: { code: 'BATCH_SEQUENCE_INVALID' },
    });
  });
});
