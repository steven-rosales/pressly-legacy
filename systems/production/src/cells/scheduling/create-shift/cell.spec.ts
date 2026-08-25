import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeCreateShiftCell } from './cell.ts';
import { createShiftIdempotency } from './idempotency.ts';

describe('production.create-shift.v1 cell', () => {
  it('declares the exact selected command protocol', () => {
    const cell = makeCreateShiftCell({
      repo: { transaction: vi.fn() },
      idempotency: createShiftIdempotency,
      policy: productionRules,
      ids: { next: () => '10000000-0000-4000-8000-000000000001' },
    });

    expect(cell.id).toBe('production.create-shift.v1');
    expect(cell.kind).toBe('command');
    expect(cell.authentication).toBe('required');
    expect(cell.authorization).toEqual({
      capability: 'production:schedule',
      timing: 'after-input',
      scope: expect.any(Function),
    });
    expect(cell.consistency).toEqual({
      transaction: 'required',
      concurrency: 'none',
    });
    expect(cell.idempotency).toMatchObject({ required: true });
    expect(cell.emits).toEqual([]);
    expect(cell.consumes).toEqual([]);
    expect(cell.surfaces).toMatchObject([
      {
        kind: 'http',
        method: 'POST',
        path: '/production/locations/:locationId/shifts',
        bodyLimit: '64kb',
        authorization: 'staged',
        contextRequirements: ['authenticated-actor'],
      },
    ]);
  });
});
