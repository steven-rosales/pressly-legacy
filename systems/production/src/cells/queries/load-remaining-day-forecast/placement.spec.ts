import { describe, expect, it, vi } from 'vitest';
import { projectRemainingDayPlacements } from './placement.ts';
import type {
  OnlinePlacementInput,
  OnlinePlacementResult,
  RemainingDayActiveRun,
  RemainingDayReadyOrder,
} from './types.ts';

const ready = (
  id: string,
  overrides: Partial<RemainingDayReadyOrder> = {},
): RemainingDayReadyOrder => ({
  id,
  dueAt: '2026-03-08T16:00:00.000Z',
  priority: false,
  derivedWeightLbs: 20,
  bagCount: 1,
  version: 1,
  ...overrides,
});
const run = (id = 'run-1'): RemainingDayActiveRun => ({
  run: {
    id,
    queueVersion: 3,
    startsAt: '2026-03-08T13:00:00.000Z',
    shiftEndsAt: '2026-03-08T22:00:00.000Z',
    pulseMinutes: 30,
    pulseCapacityLbs: 100,
  },
  machines: [],
  batches: [],
});
const proposed = (input: OnlinePlacementInput): OnlinePlacementResult => ({
  kind: 'proposed',
  affectedFromSequence: 0,
  affectedBatches: [
    {
      sourceBatchId: input.batches[0]?.id ?? null,
      sequence: 0,
      status: 'queued',
      membershipFrozen: false,
      orderIds: [...(input.batches[0]?.orderIds ?? []), input.order.id],
      priorityOrderIds: input.order.priority ? [input.order.id] : [],
      derivedWeightLbs:
        (input.batches[0]?.derivedWeightLbs ?? 0) +
        input.order.derivedWeightLbs,
      bagCount: (input.batches[0]?.bagCount ?? 0) + input.order.bagCount,
      stages: [],
    },
  ],
  overtime: { required: false },
});

describe('remaining-day scheduler decision', () => {
  it('uses priority, due instant, and id ordering while carrying accepted projections', () => {
    const scheduler = vi.fn(proposed);
    const projection = projectRemainingDayPlacements({
      activeRuns: [run()],
      readyOrders: [
        ready('order-z'),
        ready('order-b', { priority: true }),
        ready('order-a', { priority: true }),
      ],
      scheduler: { proposeOnlinePlacement: scheduler },
    });
    expect(
      projection.decisions.map((decision) => decision.productionOrderId),
    ).toEqual(['order-a', 'order-b', 'order-z']);
    expect(projection.decisions.every((item) => item.reason === null)).toBe(
      true,
    );
    expect(scheduler.mock.calls[1]?.[0]).toMatchObject({
      run: { queueVersion: 4 },
      batches: [{ orderIds: ['order-a'] }],
    });
  });

  it('classifies missing, ambiguous, rejected, and overtime run capacity exactly', () => {
    const order = ready('order-1');
    expect(
      projectRemainingDayPlacements({
        activeRuns: [],
        readyOrders: [order],
        scheduler: { proposeOnlinePlacement: vi.fn() },
      }).decisions[0],
    ).toMatchObject({ reason: 'no_active_run' });
    expect(
      projectRemainingDayPlacements({
        activeRuns: [run(), run('run-2')],
        readyOrders: [order],
        scheduler: { proposeOnlinePlacement: vi.fn() },
      }).decisions[0],
    ).toMatchObject({ reason: 'ambiguous_active_run' });
    for (const [result, reason] of [
      [{ kind: 'rejected' as const }, 'placement_rejected'],
      [
        {
          ...proposed({
            order: {
              id: order.id,
              priority: false,
              derivedWeightLbs: 20,
              bagCount: 1,
              version: 1,
            },
            ...run(),
            mode: { type: 'automatic' },
          }),
          overtime: { required: true },
        },
        'current_run_window_exceeded',
      ],
    ] as const)
      expect(
        projectRemainingDayPlacements({
          activeRuns: [run()],
          readyOrders: [order],
          scheduler: { proposeOnlinePlacement: () => result },
        }).decisions[0],
      ).toMatchObject({ reason });
  });
});
