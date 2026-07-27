import { describe, expect, it } from 'vitest';
import type {
  RemainingDayActiveRun,
  RemainingDayReadyOrder,
} from '../../src/remaining-day-forecast/remaining-day-forecast.port.ts';
import { makeRemainingDayForecastProjection } from '../../src/remaining-day-forecast/remaining-day-forecast.computation.ts';
import { proposeOnlinePlacement } from '../../src/online-placement/online-placement.computation.ts';

const projectRemainingDayForecast = makeRemainingDayForecastProjection(
  proposeOnlinePlacement,
);

const readyOrder = (
  id: string,
  input: Partial<RemainingDayReadyOrder> = {},
): RemainingDayReadyOrder => ({
  id,
  dueAt: '2026-07-26T16:00:00.000Z',
  priority: false,
  derivedWeightLbs: 40,
  bagCount: 2,
  version: 1,
  ...input,
});

const activeRun = (
  input: Partial<RemainingDayActiveRun['run']> = {},
): RemainingDayActiveRun => ({
  run: {
    id: 'run-1',
    queueVersion: 3,
    startsAt: '2026-07-26T12:00:00.000Z',
    shiftEndsAt: '2026-07-26T22:00:00.000Z',
    pulseMinutes: 30,
    pulseCapacityLbs: 100,
    ...input,
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
  batches: [],
});

describe('remaining-day forecast placement projection', () => {
  it('classifies ready work without a unique active run as needing a shift', () => {
    const order = readyOrder('order-1');

    expect(
      projectRemainingDayForecast({ activeRuns: [], readyOrders: [order] }),
    ).toEqual({
      algorithmVersion: 'online-stable-insertion-v1',
      decisions: [
        {
          productionOrderId: order.id,
          disposition: 'needs_shift',
          reason: 'no_active_run',
        },
      ],
    });

    expect(
      projectRemainingDayForecast({
        activeRuns: [activeRun(), activeRun({ id: 'run-2' })],
        readyOrders: [order],
      }).decisions[0],
    ).toMatchObject({
      disposition: 'needs_shift',
      reason: 'ambiguous_active_run',
    });
  });

  it('uses canonical priority, due, and id ordering', () => {
    const forecast = projectRemainingDayForecast({
      activeRuns: [activeRun()],
      readyOrders: [
        readyOrder('order-z', {
          dueAt: '2026-07-26T15:00:00.000Z',
        }),
        readyOrder('order-b', {
          priority: true,
          dueAt: '2026-07-26T14:00:00.000Z',
        }),
        readyOrder('order-a', {
          priority: true,
          dueAt: '2026-07-26T14:00:00.000Z',
        }),
      ],
    });

    expect(
      forecast.decisions.map((decision) => decision.productionOrderId),
    ).toEqual(['order-a', 'order-b', 'order-z']);
  });

  it('carries accepted ephemeral placements into later decisions', () => {
    const forecast = projectRemainingDayForecast({
      activeRuns: [activeRun({ shiftEndsAt: '2026-07-26T14:00:00.000Z' })],
      readyOrders: [
        readyOrder('order-1', { derivedWeightLbs: 60 }),
        readyOrder('order-2', { derivedWeightLbs: 40 }),
        readyOrder('order-3', { derivedWeightLbs: 50 }),
      ],
    });

    expect(forecast.decisions).toEqual([
      {
        productionOrderId: 'order-1',
        disposition: 'ready_to_place',
        reason: null,
      },
      {
        productionOrderId: 'order-2',
        disposition: 'ready_to_place',
        reason: null,
      },
      {
        productionOrderId: 'order-3',
        disposition: 'needs_shift',
        reason: 'current_run_window_exceeded',
      },
    ]);
  });

  it('does not apply a rejected or overtime projection to later work', () => {
    const forecast = projectRemainingDayForecast({
      activeRuns: [activeRun({ shiftEndsAt: '2026-07-26T14:00:00.000Z' })],
      readyOrders: [
        readyOrder('oversized', {
          priority: true,
          derivedWeightLbs: 101,
        }),
        readyOrder('fits', { derivedWeightLbs: 40 }),
      ],
    });

    expect(forecast.decisions).toEqual([
      {
        productionOrderId: 'oversized',
        disposition: 'needs_shift',
        reason: 'placement_rejected',
      },
      {
        productionOrderId: 'fits',
        disposition: 'ready_to_place',
        reason: null,
      },
    ]);
  });

  it('is deterministic for the same persisted snapshot', () => {
    const input = {
      activeRuns: [activeRun()],
      readyOrders: [readyOrder('order-1'), readyOrder('order-2')],
    };

    expect(projectRemainingDayForecast(input)).toEqual(
      projectRemainingDayForecast(input),
    );
  });
});
