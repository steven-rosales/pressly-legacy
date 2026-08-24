import { describe, expect, it } from 'vitest';
import type { SchedulingInput } from './model.ts';
import { proposeFixedPulseScheduleV2 } from './propose-v2.ts';

const id = (index: number) =>
  `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;

const workedInput = (): SchedulingInput => ({
  orders: [150, 74, 140, 84, 130, 94, 128].map((weight, index) => ({
    id: id(index + 1),
    externalOrderId: `order-${index + 1}`,
    dueAt: '2026-07-10T20:00:00.000Z',
    priority: false,
    derivedWeightLbs: weight,
    bagCount: [3, 2, 4, 2, 3, 2, 3][index]!,
    version: 1,
  })),
  machines: [
    ...Array.from({ length: 11 }, (_, index) => ({
      id: id(100 + index),
      stationKind: 'washing' as const,
      effectiveCapacityLbs: 17,
      active: true,
    })),
    ...Array.from({ length: 7 }, (_, index) => ({
      id: id(120 + index),
      stationKind: 'washing' as const,
      effectiveCapacityLbs: 37,
      active: true,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      id: id(140 + index),
      stationKind: 'washing' as const,
      effectiveCapacityLbs: 57,
      active: true,
    })),
    ...Array.from({ length: 22 }, (_, index) => ({
      id: id(200 + index),
      stationKind: 'drying' as const,
      effectiveCapacityLbs: 30,
      active: true,
    })),
  ],
  shift: {
    id: id(300),
    startsAt: '2026-07-10T14:00:00.000Z',
    endsAt: '2026-07-10T20:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    version: 1,
  },
  config: {
    id: id(301),
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
  },
});

const goldenInput = (): SchedulingInput => ({
  orders: [
    {
      id: id(1),
      externalOrderId: 'ORDER-1',
      dueAt: '2026-07-10T12:00:00.000Z',
      priority: true,
      derivedWeightLbs: 70,
      bagCount: 2,
      version: 3,
    },
  ],
  machines: [
    {
      id: id(10),
      stationKind: 'washing',
      effectiveCapacityLbs: 100,
      active: true,
    },
    {
      id: id(11),
      stationKind: 'drying',
      effectiveCapacityLbs: 100,
      active: true,
    },
  ],
  shift: {
    id: id(20),
    startsAt: '2026-07-10T08:00:00.000Z',
    endsAt: '2026-07-10T12:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    version: 4,
  },
  config: {
    id: id(21),
    pulseMinutes: 30,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 5,
  },
});

describe('fixed-pulse-ffd-v2 scheduling', () => {
  it('reproduces the 800 lb manual calculation exactly', () => {
    const proposal = proposeFixedPulseScheduleV2(workedInput());

    expect(proposal.algorithmVersion).toBe('fixed-pulse-ffd-v2');
    expect(proposal.pulseCapacityLbs).toBe(224);
    expect(proposal.batches.map((batch) => batch.derivedWeightLbs)).toEqual([
      224, 224, 224, 128,
    ]);
    expect(proposal.batches.map((batch) => batch.bagCount)).toEqual([
      5, 6, 5, 3,
    ]);
    expect(proposal.makespanMinutes).toBe(392);
    expect(proposal.plannedCompletionAt).toBe('2026-07-10T20:32:00.000Z');
    expect(proposal.warnings).toContainEqual(
      expect.objectContaining({ code: 'SHIFT_OVERFLOW', blocking: true }),
    );
    expect(
      proposal.batches.every((batch) =>
        batch.stages.every(
          (stage) =>
            Date.parse(stage.endsAt) - Date.parse(stage.startsAt) ===
            56 * 60_000,
        ),
      ),
    ).toBe(true);
  });

  it('is byte-equivalent and hash-equivalent for the same snapshot', () => {
    const first = proposeFixedPulseScheduleV2(workedInput());
    const second = proposeFixedPulseScheduleV2(workedInput());

    expect(first.canonicalOutput).toBe(second.canonicalOutput);
    expect(first.outputPlanHash).toBe(second.outputPlanHash);
    expect(first.inputSnapshotHash).toBe(second.inputSnapshotHash);
  });

  it('shows that whole-order packing can exceed the weight lower bound', () => {
    const input = workedInput();
    const proposal = proposeFixedPulseScheduleV2({
      ...input,
      orders: Array.from({ length: 5 }, (_, index) => ({
        ...input.orders[index]!,
        id: id(400 + index),
        derivedWeightLbs: 160,
      })),
    });

    expect(proposal.batchCount).toBe(5);
    expect(proposal.batches.map((batch) => batch.derivedWeightLbs)).toEqual([
      160, 160, 160, 160, 160,
    ]);
  });

  it('places priority first and includes all eligible work regardless of due date', () => {
    const input = workedInput();
    const proposal = proposeFixedPulseScheduleV2({
      ...input,
      orders: [
        { ...input.orders[0]!, id: id(501), derivedWeightLbs: 100 },
        {
          ...input.orders[1]!,
          id: id(502),
          priority: true,
          derivedWeightLbs: 50,
          dueAt: '2026-07-20T20:00:00.000Z',
        },
        {
          ...input.orders[2]!,
          id: id(503),
          derivedWeightLbs: 50,
          dueAt: '2026-07-20T20:00:00.000Z',
        },
      ],
    });

    expect(proposal.batches[0]?.orderIds[0]).toBe(id(502));
    expect(proposal.batches.flatMap((batch) => batch.orderIds)).toContain(
      id(503),
    );
  });

  it('returns oversized work explicitly without splitting it', () => {
    const input = workedInput();
    const oversized = { ...input.orders[0]!, derivedWeightLbs: 225 };
    const proposal = proposeFixedPulseScheduleV2({
      ...input,
      orders: [oversized],
    });

    expect(proposal.batches).toEqual([]);
    expect(proposal.unplacedOrderIds).toEqual([oversized.id]);
    expect(proposal.warnings).toContainEqual(
      expect.objectContaining({
        code: 'OVERSIZED_ORDER',
        orderIds: [oversized.id],
      }),
    );
  });

  it('fails closed when any constrained stage has no capacity', () => {
    const input = workedInput();
    const proposal = proposeFixedPulseScheduleV2({
      ...input,
      machines: input.machines.filter(
        (machine) => machine.stationKind !== 'drying',
      ),
    });

    expect(proposal.pulseCapacityLbs).toBe(0);
    expect(proposal.batches).toEqual([]);
    expect(proposal.warnings).toContainEqual(
      expect.objectContaining({ code: 'NO_ACTIVE_DRYERS', blocking: true }),
    );
  });

  it('pins literal canonical output and SHA-256 bytes', () => {
    const output = proposeFixedPulseScheduleV2(goldenInput());

    expect(output.canonicalOutput).toBe(
      '{"algorithmVersion":"fixed-pulse-ffd-v2","batchCount":1,"batches":[{"bagCount":2,"derivedWeightLbs":70,"orderIds":["00000000-0000-4000-8000-000000000001"],"sequence":0,"stages":[{"endsAt":"2026-07-10T08:30:00.000Z","machineIds":[],"stage":"sorting","startsAt":"2026-07-10T08:00:00.000Z"},{"endsAt":"2026-07-10T09:00:00.000Z","machineIds":["00000000-0000-4000-8000-000000000010"],"stage":"washing","startsAt":"2026-07-10T08:30:00.000Z"},{"endsAt":"2026-07-10T09:30:00.000Z","machineIds":["00000000-0000-4000-8000-000000000011"],"stage":"drying","startsAt":"2026-07-10T09:00:00.000Z"},{"endsAt":"2026-07-10T10:00:00.000Z","machineIds":[],"stage":"folding_packaging","startsAt":"2026-07-10T09:30:00.000Z"}]}],"makespanMinutes":120,"plannedCompletionAt":"2026-07-10T10:00:00.000Z","pulseCapacityLbs":100,"pulseMinutes":30,"unplacedOrderIds":[],"warnings":[]}',
    );
    expect(output.outputPlanHash).toBe(
      '2dfc851c6d509cb80107cb3f7b40d140d087031c60a6940bb0689e51491f32e0',
    );
    expect(output.inputSnapshotHash).toBe(
      '5b8849eab9ebf62e19d65235165e0b8fa42f677d7b784dd0db447176283c2f82',
    );
  });
});
