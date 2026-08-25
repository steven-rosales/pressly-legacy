import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeCommitOrderBacklogCell } from './cell.ts';
import { commitOrderBacklogIdempotency } from './idempotency.ts';

describe('commit order backlog cell declaration', () => {
  it('declares the selected manager command', () => {
    const cell = makeCommitOrderBacklogCell({
      repo: { transaction: vi.fn() },
      idempotency: commitOrderBacklogIdempotency,
      policy: productionRules,
      clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
      ids: { next: () => '75000000-0000-4000-8000-000000000001' },
    });

    expect(cell).toMatchObject({
      id: 'production.commit-order-backlog.v1',
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
      },
      idempotency: { required: true },
      emits: [],
      consumes: [],
      observability: { operation: 'production.commit_order_backlog' },
      surfaces: [
        {
          kind: 'http',
          method: 'POST',
          path: '/production/locations/:locationId/order-backlog',
          authorization: 'staged',
          contextRequirements: ['authenticated-actor'],
        },
      ],
    });
  });
});
