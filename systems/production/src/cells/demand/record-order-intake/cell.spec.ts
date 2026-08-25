import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeRecordOrderIntakeCell } from './cell.ts';
import { recordOrderIntakeIdempotency } from './idempotency.ts';

describe('record order intake cell declaration', () => {
  it('declares the selected command', () => {
    const cell = makeRecordOrderIntakeCell({
      repo: { transaction: vi.fn() },
      idempotency: recordOrderIntakeIdempotency,
      policy: productionRules,
      clock: { now: () => new Date('2026-08-21T15:00:00.000Z') },
    });

    expect(cell.id).toBe('production.record-order-intake.v1');
    expect(cell.kind).toBe('command');
    expect(cell.authentication).toBe('required');
    expect(cell.authorization).toEqual({
      capability: 'production:intake',
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
      operation: 'production.record_order_intake',
    });
    expect(cell.surfaces).toMatchObject([
      {
        kind: 'http',
        method: 'PUT',
        path: '/production/locations/:locationId/orders/:productionOrderId/intake',
        bodyLimit: '64kb',
        authorization: 'staged',
        contextRequirements: ['authenticated-actor'],
      },
    ]);
  });
});
