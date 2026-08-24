import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeChangeAdmissionCell } from './cell.ts';
import { changeAdmissionIdempotency } from './idempotency.ts';

describe('change admission cell declaration', () => {
  it('declares the selected PUT operation', () => {
    const cell = makeChangeAdmissionCell({
      repo: { transaction: vi.fn() },
      idempotency: changeAdmissionIdempotency,
      policy: productionRules,
      clock: { now: () => new Date('2026-08-21T15:00:00.000Z') },
    });

    expect(cell.id).toBe('production.change-admission.v1');
    expect(cell.kind).toBe('command');
    expect(cell.authentication).toBe('required');
    expect(cell.authorization).toEqual({
      capability: 'production:admission',
      timing: 'after-input',
      scope: expect.any(Function),
    });
    expect(cell.consistency).toMatchObject({
      transaction: 'required',
      concurrency: 'optimistic',
    });
    expect(cell.idempotency).toMatchObject({ required: true });
    expect(cell.emits).toEqual([]);
    expect(cell.consumes).toEqual([]);
    expect(cell.observability).toEqual({
      operation: 'production.change_admission',
    });
    expect(cell.surfaces).toMatchObject([
      {
        kind: 'http',
        method: 'PUT',
        path: '/production/locations/:locationId/orders/:productionOrderId/admission',
        bodyLimit: '64kb',
        authorization: 'staged',
        contextRequirements: ['authenticated-actor'],
      },
    ]);
  });
});
