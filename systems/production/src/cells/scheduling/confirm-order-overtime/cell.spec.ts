import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeConfirmOrderOvertimeCell } from './cell.ts';
import { confirmOrderOvertimeIdempotency } from './idempotency.ts';

describe('production.confirm-order-overtime.v1 cell', () => {
  it('is selected, staged, override-authorized, optimistic, and idempotent', () => {
    const cell = makeConfirmOrderOvertimeCell({
      repo: { findOvertimeProposal: vi.fn(), transaction: vi.fn() },
      idempotency: confirmOrderOvertimeIdempotency,
      policy: productionRules,
      proposeOnlinePlacement: vi.fn(),
      clock: { now: () => new Date(0) },
    });
    expect(cell).toMatchObject({
      id: 'production.confirm-order-overtime.v1',
      kind: 'command',
      authentication: 'required',
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
        scope: expect.any(Function),
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        expectedVersion: expect.any(Function),
      },
      idempotency: { required: true },
      emits: [],
      consumes: [],
      observability: { operation: 'production.confirm_order_overtime' },
    });
    expect(cell.surfaces).toMatchObject([
      {
        kind: 'http',
        method: 'POST',
        path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime',
        authorization: 'staged',
      },
    ]);
  });
});
