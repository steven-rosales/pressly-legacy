import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeCreateScheduleCell } from './cell.ts';
describe('create schedule cell', () => {
  it('is owner-assembled, runtime-unselected, after-input, partitioned, and idempotent', () => {
    const cell = makeCreateScheduleCell({
      repo: { transaction: vi.fn() },
      idempotency: { resolveReplay: () => ({ kind: 'miss' }) },
      scheduler: { propose: vi.fn() },
      policy: productionRules,
      clock: { now: () => new Date() },
      ids: { next: () => 'id' },
    });
    expect(cell).toMatchObject({
      id: 'production.create-schedule.v1',
      kind: 'command',
      authentication: 'required',
      authorization: {
        capability: 'production:schedule',
        timing: 'after-input',
      },
      consistency: { transaction: 'required', concurrency: 'partitioned' },
      idempotency: { required: true },
    });
  });
});
