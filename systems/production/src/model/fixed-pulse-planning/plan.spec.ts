import { canonicalJson } from '@pressly/codec';
import { describe, expect, it } from 'vitest';
import {
  buildFixedPulseStages,
  fixedPulseMakespanMinutes,
  packFixedPulseItems,
  pulseCapacity,
  sortFixedPulseItems,
} from './plan.ts';

const machines = [
  {
    id: 'washer-b',
    stationKind: 'washing' as const,
    effectiveCapacityLbs: 60,
    active: true,
  },
  {
    id: 'washer-a',
    stationKind: 'washing' as const,
    effectiveCapacityLbs: 60,
    active: true,
  },
  {
    id: 'dryer',
    stationKind: 'drying' as const,
    effectiveCapacityLbs: 100,
    active: true,
  },
];

const items = [
  {
    id: 'later',
    dueAt: '2026-07-13T14:00:00.000Z',
    priority: false,
    weightLbs: 40,
    value: null,
  },
  {
    id: 'next',
    dueAt: '2026-07-11T14:00:00.000Z',
    priority: false,
    weightLbs: 40,
    value: null,
  },
  {
    id: 'same',
    dueAt: '2026-07-11T01:00:00.000Z',
    priority: false,
    weightLbs: 40,
    value: null,
  },
  {
    id: 'priority',
    dueAt: '2026-07-20T14:00:00.000Z',
    priority: true,
    weightLbs: 20,
    value: null,
  },
];

describe('fixed-pulse planning', () => {
  it('preserves local-day priority ordering, pulse capacity, and whole-item first fit', () => {
    const sorted = sortFixedPulseItems(items, {
      startsAt: '2026-07-10T14:00:00.000Z',
      timezone: 'America/New_York',
    });
    const capacity = pulseCapacity({
      machines,
      foldLbsPerFolderMinute: 2,
      effectiveFolderCount: 2,
      pulseMinutes: 30,
    });
    const batches = packFixedPulseItems(sorted, capacity.pulseCapacityLbs);

    expect(sorted.map((item) => item.id)).toEqual([
      'priority',
      'same',
      'next',
      'later',
    ]);
    expect(capacity).toEqual({
      washerCapacityLbs: 120,
      dryerCapacityLbs: 100,
      foldingCapacityLbs: 120,
      pulseCapacityLbs: 100,
    });
    expect(batches.map((batch) => batch.weightLbs)).toEqual([100, 40]);
    expect(fixedPulseMakespanMinutes(batches.length, 30)).toBe(150);
    expect(fixedPulseMakespanMinutes(0, 30)).toBe(0);
  });

  it('preserves capacity-descending machine choice, UUID tie breaks, and four pulse windows', () => {
    expect(
      buildFixedPulseStages({
        startsAt: '2026-07-10T14:00:00.000Z',
        pulseMinutes: 30,
        batchSequence: 1,
        batchWeightLbs: 70,
        machines,
      }),
    ).toEqual([
      {
        stage: 'sorting',
        startsAt: '2026-07-10T14:30:00.000Z',
        endsAt: '2026-07-10T15:00:00.000Z',
        machineIds: [],
      },
      {
        stage: 'washing',
        startsAt: '2026-07-10T15:00:00.000Z',
        endsAt: '2026-07-10T15:30:00.000Z',
        machineIds: ['washer-a', 'washer-b'],
      },
      {
        stage: 'drying',
        startsAt: '2026-07-10T15:30:00.000Z',
        endsAt: '2026-07-10T16:00:00.000Z',
        machineIds: ['dryer'],
      },
      {
        stage: 'folding_packaging',
        startsAt: '2026-07-10T16:00:00.000Z',
        endsAt: '2026-07-10T16:30:00.000Z',
        machineIds: [],
      },
    ]);
  });

  it('pins deterministic fixed-pulse output bytes', () => {
    const sorted = sortFixedPulseItems(items, {
      startsAt: '2026-07-10T14:00:00.000Z',
      timezone: 'America/New_York',
    });
    const capacity = pulseCapacity({
      machines,
      foldLbsPerFolderMinute: 2,
      effectiveFolderCount: 2,
      pulseMinutes: 30,
    });
    const bytes = canonicalJson({
      batches: packFixedPulseItems(sorted, capacity.pulseCapacityLbs).map(
        (batch) => ({
          ids: batch.items.map((item) => item.id),
          weightLbs: batch.weightLbs,
        }),
      ),
      capacity,
      sortedIds: sorted.map((item) => item.id),
      stages: buildFixedPulseStages({
        startsAt: '2026-07-10T14:00:00.000Z',
        pulseMinutes: 30,
        batchSequence: 1,
        batchWeightLbs: 70,
        machines,
      }),
    });

    expect(bytes).toBe(
      '{"batches":[{"ids":["priority","same","next"],"weightLbs":100},{"ids":["later"],"weightLbs":40}],"capacity":{"dryerCapacityLbs":100,"foldingCapacityLbs":120,"pulseCapacityLbs":100,"washerCapacityLbs":120},"sortedIds":["priority","same","next","later"],"stages":[{"endsAt":"2026-07-10T15:00:00.000Z","machineIds":[],"stage":"sorting","startsAt":"2026-07-10T14:30:00.000Z"},{"endsAt":"2026-07-10T15:30:00.000Z","machineIds":["washer-a","washer-b"],"stage":"washing","startsAt":"2026-07-10T15:00:00.000Z"},{"endsAt":"2026-07-10T16:00:00.000Z","machineIds":["dryer"],"stage":"drying","startsAt":"2026-07-10T15:30:00.000Z"},{"endsAt":"2026-07-10T16:30:00.000Z","machineIds":[],"stage":"folding_packaging","startsAt":"2026-07-10T16:00:00.000Z"}]}',
    );
  });
});
