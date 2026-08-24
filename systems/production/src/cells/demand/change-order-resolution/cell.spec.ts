import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeChangeOrderResolutionCell } from './cell.ts';
import { changeOrderResolutionIdempotency } from './idempotency.ts';

describe('change order resolution cell declaration', () => {
  it('declares the selected bundled command', () => {
    const cell = makeChangeOrderResolutionCell({
      repo: { transaction: vi.fn() },
      idempotency: changeOrderResolutionIdempotency,
      policy: productionRules,
      clock: { now: () => new Date('2026-08-21T15:00:00.000Z') },
    });
    expect(cell.id).toBe('production.change-order-resolution.v1');
    expect(cell.kind).toBe('command');
    expect(cell.authentication).toBe('required');
    expect(cell.authorization).toEqual({
      capability: 'production:override',
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
      operation: 'production.change_order_resolution',
    });
  });
});
