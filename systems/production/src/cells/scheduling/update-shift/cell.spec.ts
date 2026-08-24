import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeUpdateShiftCell } from './cell.ts';
import { updateShiftIdempotency } from './idempotency.ts';

describe('production.update-shift.v1 cell', () => {
  it('declares a selected, authenticated, optimistic command surface', () => {
    const cell = makeUpdateShiftCell({
      repo: { transaction: vi.fn() },
      idempotency: updateShiftIdempotency,
      policy: productionRules,
      clock: { now: () => new Date(0) },
    });

    expect(cell.id).toBe('production.update-shift.v1');
    expect(cell.kind).toBe('command');
    expect(cell.authentication).toBe('required');
    expect(cell.authorization).toEqual({
      capability: 'production:schedule',
      timing: 'after-input',
      scope: expect.any(Function),
    });
    expect(cell.consistency).toEqual({
      transaction: 'required',
      concurrency: 'optimistic',
      expectedVersion: expect.any(Function),
    });
    expect(cell.idempotency).toMatchObject({ required: true });
    expect(cell.emits).toEqual([]);
    expect(cell.consumes).toEqual([]);
    expect(cell.observability).toEqual({
      operation: 'production.update_shift',
    });
    expect(cell.surfaces).toMatchObject([
      {
        kind: 'http',
        method: 'PATCH',
        path: '/production/locations/:locationId/shifts/:productionShiftId',
        authorization: 'staged',
      },
    ]);
    const surface = cell.surfaces[0];
    if (surface?.kind !== 'http') {
      expect.unreachable('Update shift must expose its HTTP surface.');
      return;
    }
    expect(surface.decodeAuthorizationScope).toEqual(expect.any(Function));
  });
});
