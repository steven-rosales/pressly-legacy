import { describe, expect, it } from 'vitest';
import {
  toCreateProductionShiftCommand,
  toProductionShiftResult,
  toUpdateProductionShiftCommand,
  toUpdateProductionShiftResult,
} from '../../../../src/features/resources/manage-shift/manage-production-shift.contract.mapper.ts';
import type { UpdateProductionShiftResult } from '../../../../src/features/resources/manage-shift/manage-production-shift.model.ts';
import type { ProductionShift } from '../../../../src/foundations/language/shifts/production-shift.entity.ts';

const shift: ProductionShift = {
  id: '10000000-0000-4000-8000-000000000001',
  locationId: 'location-1',
  startsAt: '2026-07-15T13:00:00.000Z',
  endsAt: '2026-07-15T21:00:00.000Z',
  timezone: 'America/New_York',
  effectiveFolderCount: 2,
  status: 'open',
  version: 1,
};

describe('production shift boundary mapper', () => {
  it('combines decoded requests with route identity', () => {
    expect(
      toCreateProductionShiftCommand(shift.locationId, {
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        timezone: shift.timezone,
        effectiveFolderCount: shift.effectiveFolderCount,
        idempotencyKey: 'create-shift-1',
      }),
    ).toEqual({
      locationId: shift.locationId,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      timezone: shift.timezone,
      effectiveFolderCount: shift.effectiveFolderCount,
      idempotencyKey: 'create-shift-1',
    });

    expect(
      toUpdateProductionShiftCommand(shift.locationId, shift.id, {
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        effectiveFolderCount: 3,
        expectedVersion: 1,
        idempotencyKey: 'update-shift-1',
      }),
    ).toEqual({
      locationId: shift.locationId,
      productionShiftId: shift.id,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      effectiveFolderCount: 3,
      expectedVersion: 1,
      idempotencyKey: 'update-shift-1',
    });
  });

  it('presents application results explicitly at the wire boundary', () => {
    expect(toProductionShiftResult(shift)).toEqual(shift);

    const outcome: UpdateProductionShiftResult = {
      productionShift: { ...shift, effectiveFolderCount: 3, version: 2 },
      supersededScheduleRunId: '10000000-0000-4000-8000-000000000002',
      replayed: false,
    };
    expect(toUpdateProductionShiftResult(outcome)).toEqual(outcome);
  });
});
