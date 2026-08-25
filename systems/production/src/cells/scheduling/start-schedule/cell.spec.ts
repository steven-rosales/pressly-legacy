import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeStartScheduleCell } from './cell.ts';

describe('start schedule cell', () => {
  it('declares the selected partitioned command and exact capability', () => {
    const cell = makeStartScheduleCell({
      repo: { transaction: vi.fn() },
      idempotency: { resolveReplay: () => ({ kind: 'miss' }) },
      policy: productionRules,
      clock: { now: () => new Date() },
    });
    expect(cell).toMatchObject({
      id: 'production.start-schedule.v1',
      kind: 'command',
      authentication: 'required',
      authorization: {
        capability: 'production:start',
        timing: 'after-input',
      },
      consistency: { transaction: 'required', concurrency: 'partitioned' },
      idempotency: { required: true },
      observability: { operation: 'production.start_schedule' },
    });
  });
});
