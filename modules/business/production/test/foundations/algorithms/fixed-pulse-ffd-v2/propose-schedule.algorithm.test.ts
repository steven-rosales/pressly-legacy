import { describe, expect, it } from 'vitest';
import { proposeSchedule } from '../../../../src/foundations/algorithms/fixed-pulse-ffd-v2/propose-schedule.algorithm.ts';
import type { SchedulingInput } from '../../../../src/foundations/algorithms/fixed-pulse-ffd-v2/propose-schedule.model.ts';

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

describe('fixed-pulse-ffd-v2 scheduling', () => {
  it('reproduces the 800 lb manual calculation exactly', () => {
    const proposal = proposeSchedule(workedInput());

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
    const first = proposeSchedule(workedInput());
    const second = proposeSchedule(workedInput());

    expect(first.canonicalOutput).toBe(second.canonicalOutput);
    expect(first.outputPlanHash).toBe(second.outputPlanHash);
    expect(first.inputSnapshotHash).toBe(second.inputSnapshotHash);
  });

  it('shows that whole-order packing can exceed the weight lower bound', () => {
    const input = workedInput();
    const proposal = proposeSchedule({
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
    const proposal = proposeSchedule({
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
    const proposal = proposeSchedule({ ...input, orders: [oversized] });

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
    const proposal = proposeSchedule({
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
});
