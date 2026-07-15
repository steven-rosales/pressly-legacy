import { describe, expect, it } from 'vitest';
import {
  updateProductionShiftCommandSchema,
  updateProductionShiftRequestSchema,
  updateProductionShiftResultSchema,
} from '../src/index.ts';

const productionShiftId = '22222222-2222-4222-8222-222222222222';

describe('production shift update contracts', () => {
  it('accepts a versioned pre-start shift update', () => {
    const command = updateProductionShiftCommandSchema.parse({
      locationId: 'pressly-one',
      productionShiftId,
      startsAt: '2026-07-15T12:00:00.000Z',
      endsAt: '2026-07-15T21:00:00.000Z',
      effectiveFolderCount: 4,
      expectedVersion: 2,
      idempotencyKey: 'shift-update-1',
    });

    expect(command).toMatchObject({
      productionShiftId,
      effectiveFolderCount: 4,
      expectedVersion: 2,
    });
    expect(
      updateProductionShiftRequestSchema.safeParse({
        startsAt: command.startsAt,
        endsAt: command.endsAt,
        effectiveFolderCount: command.effectiveFolderCount,
        expectedVersion: command.expectedVersion,
        idempotencyKey: command.idempotencyKey,
      }).success,
    ).toBe(true);
  });

  it.each([
    {
      name: 'a reversed window',
      patch: {
        startsAt: '2026-07-15T21:00:00.000Z',
        endsAt: '2026-07-15T12:00:00.000Z',
      },
    },
    { name: 'zero folders', patch: { effectiveFolderCount: 0 } },
    { name: 'a non-positive version', patch: { expectedVersion: 0 } },
  ])('rejects $name', ({ patch }) => {
    expect(
      updateProductionShiftCommandSchema.safeParse({
        locationId: 'pressly-one',
        productionShiftId,
        startsAt: '2026-07-15T12:00:00.000Z',
        endsAt: '2026-07-15T21:00:00.000Z',
        effectiveFolderCount: 4,
        expectedVersion: 2,
        idempotencyKey: 'shift-update-1',
        ...patch,
      }).success,
    ).toBe(false);
  });

  it('represents the authoritative shift and invalidated plan', () => {
    expect(
      updateProductionShiftResultSchema.parse({
        productionShift: {
          id: productionShiftId,
          locationId: 'pressly-one',
          startsAt: '2026-07-15T12:00:00.000Z',
          endsAt: '2026-07-15T21:00:00.000Z',
          timezone: 'America/New_York',
          effectiveFolderCount: 4,
          status: 'open',
          version: 3,
        },
        supersededScheduleRunId: '33333333-3333-4333-8333-333333333333',
        replayed: false,
      }),
    ).toMatchObject({
      productionShift: { id: productionShiftId, version: 3 },
      replayed: false,
    });
  });
});
