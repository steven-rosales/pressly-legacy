import { describe, expect, it } from 'vitest';
import type {
  OnlinePlacementBatch,
  OnlinePlacementInput,
  OnlinePlacementStage,
} from './model.ts';
import { proposeOnlinePlacementV1 } from './propose-v1.ts';

const startsAt = '2026-07-10T08:00:00.000Z';
const stages = (
  sequence: number,
  marker = '',
): readonly OnlinePlacementStage[] =>
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
    status?: OnlinePlacementBatch['status'];
    marker?: string;
  }> = {},
): OnlinePlacementBatch => ({
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
  batches: readonly OnlinePlacementBatch[],
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

const expectProposed = (
  result: ReturnType<typeof proposeOnlinePlacementV1>,
) => {
  expect(result.kind).toBe('proposed');
  if (result.kind !== 'proposed')
    return expect.unreachable(`unexpected rejection: ${result.reason.code}`);
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
      proposeOnlinePlacementV1({
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

  it('inserts priority work after every immutable or priority anchor', () => {
    const original = [
      batch(0, 100, { status: 'sorting', frozen: true }),
      batch(1, 100, { priority: true }),
      batch(2, 100),
      batch(3, 100, { frozen: true, marker: '-frozen' }),
      batch(4, 100),
    ];
    const proposal = expectProposed(
      proposeOnlinePlacementV1({
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
      proposeOnlinePlacementV1(
        input([batch(0, 50), batch(1, 60), batch(2, 60)]),
      ),
    );

    expect(proposal.target).toEqual({
      type: 'existing_batch',
      batchId: 'batch-1',
      sequence: 1,
    });
    expect(proposal.affectedBatches[0]?.derivedWeightLbs).toBe(90);
  });

  it('appends ordinary work when no mutable batch fits', () => {
    const proposal = expectProposed(
      proposeOnlinePlacementV1(input([batch(0, 80), batch(1, 75)])),
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
    const placed = expectProposed(
      proposeOnlinePlacementV1({
        ...input([batch(0, 10), batch(1, 60)]),
        mode: { type: 'manager_exact', targetBatchId: 'batch-0' },
      }),
    );

    expect(placed.target).toEqual({
      type: 'existing_batch',
      batchId: 'batch-0',
      sequence: 0,
    });
  });

  it.each([
    {
      name: 'frozen',
      candidate: batch(0, 10, { frozen: true }),
      code: 'TARGET_BATCH_NOT_MUTABLE',
    },
    {
      name: 'started',
      candidate: batch(0, 10, { status: 'sorting' }),
      code: 'TARGET_BATCH_NOT_MUTABLE',
    },
    {
      name: 'over capacity',
      candidate: batch(0, 80),
      code: 'TARGET_BATCH_CAPACITY_EXCEEDED',
    },
  ])('rejects an exact $name target', ({ candidate, code }) => {
    expect(
      proposeOnlinePlacementV1({
        ...input([candidate]),
        mode: { type: 'manager_exact', targetBatchId: 'batch-0' },
      }),
    ).toMatchObject({ kind: 'rejected', reason: { code } });
  });

  it('rejects an exact target missing from the run', () => {
    expect(
      proposeOnlinePlacementV1({
        ...input([batch(0, 10), batch(1, 60)]),
        mode: { type: 'manager_exact', targetBatchId: 'missing' },
      }),
    ).toMatchObject({
      kind: 'rejected',
      reason: { code: 'TARGET_BATCH_NOT_FOUND' },
    });
  });

  it('never changes frozen stage windows when placing into an earlier batch', () => {
    const frozen = batch(1, 100, {
      frozen: true,
      marker: '-do-not-change',
    });
    const proposal = expectProposed(
      proposeOnlinePlacementV1({
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

  it('pins canonical placement JSON and SHA-256 bytes', () => {
    const candidate = input([batch(0, 100), batch(1, 100), batch(2, 100)], {
      run: {
        ...input([]).run,
        shiftEndsAt: '2026-07-10T14:00:00.000Z',
      },
    });
    const proposal = expectProposed(proposeOnlinePlacementV1(candidate));

    expect(proposal.projectedCompletionAt).toBe('2026-07-10T15:00:00.000Z');
    expect(proposal.overtime).toEqual({
      required: true,
      shiftEndsAt: '2026-07-10T14:00:00.000Z',
      overrunMinutes: 60,
    });
    expect(proposal.canonicalPlacement).toBe(
      '{"affectedBatches":[{"bagCount":2,"changed":true,"derivedWeightLbs":30,"membershipFrozen":false,"orderIds":["arriving-order"],"priorityOrderIds":[],"sequence":3,"sourceBatchId":null,"stages":[{"endsAt":"2026-07-10T12:00:00.000Z","machineIds":[],"stage":"sorting","startsAt":"2026-07-10T11:00:00.000Z"},{"endsAt":"2026-07-10T13:00:00.000Z","machineIds":["washer-1"],"stage":"washing","startsAt":"2026-07-10T12:00:00.000Z"},{"endsAt":"2026-07-10T14:00:00.000Z","machineIds":["dryer-1"],"stage":"drying","startsAt":"2026-07-10T13:00:00.000Z"},{"endsAt":"2026-07-10T15:00:00.000Z","machineIds":[],"stage":"folding_packaging","startsAt":"2026-07-10T14:00:00.000Z"}],"status":"queued"}],"affectedFromSequence":3,"algorithmVersion":"online-stable-insertion-v1","expectedQueueVersion":7,"overtime":{"overrunMinutes":60,"required":true,"shiftEndsAt":"2026-07-10T14:00:00.000Z"},"projectedCompletionAt":"2026-07-10T15:00:00.000Z","target":{"insertAtSequence":3,"type":"new_batch"}}',
    );
    expect(proposal.placementPlanHash).toBe(
      '7a7f989611199028fe7095384fefd36a7bdb180595317d5b861304293f85fe13',
    );
    expect(proposal.inputSnapshotHash).toBe(
      '93a9e5a532ab4716ee06b55b554be6a552435c51ad1548d1baaeb65418e059de',
    );
  });

  it('binds the proposal hash to the expected queue version', () => {
    const candidate = input([batch(0, 100)]);
    const first = expectProposed(proposeOnlinePlacementV1(candidate));
    const changedVersion = expectProposed(
      proposeOnlinePlacementV1({
        ...candidate,
        run: { ...candidate.run, queueVersion: candidate.run.queueVersion + 1 },
      }),
    );

    expect(first.placementPlanHash).not.toBe(changedVersion.placementPlanHash);
  });

  it('rejects invalid weights, bag counts, capacity, oversized work, and malformed sequences', () => {
    expect(
      proposeOnlinePlacementV1({
        ...input([]),
        order: { ...input([]).order, derivedWeightLbs: Number.NaN },
      }),
    ).toMatchObject({ reason: { code: 'ORDER_WEIGHT_INVALID' } });
    expect(
      proposeOnlinePlacementV1({
        ...input([]),
        order: { ...input([]).order, bagCount: -1 },
      }),
    ).toMatchObject({ reason: { code: 'ORDER_BAG_COUNT_INVALID' } });
    expect(
      proposeOnlinePlacementV1({
        ...input([]),
        run: { ...input([]).run, pulseCapacityLbs: 0 },
      }),
    ).toMatchObject({ reason: { code: 'PULSE_CAPACITY_INVALID' } });
    expect(
      proposeOnlinePlacementV1({
        ...input([]),
        order: { ...input([]).order, derivedWeightLbs: 101 },
      }),
    ).toMatchObject({ reason: { code: 'ORDER_EXCEEDS_PULSE_CAPACITY' } });
    expect(
      proposeOnlinePlacementV1(input([{ ...batch(0, 20), sequence: 1 }])),
    ).toMatchObject({ reason: { code: 'BATCH_SEQUENCE_INVALID' } });
  });
});
