import { configError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteCompleteOrderOutbox } from './execute.ts';

const now = new Date('2026-08-22T16:00:00.000Z');
const command = { eventId: 'event-1', workerId: 'worker-1' };

describe('execute complete Order outbox', () => {
  it.each([true, false])(
    'returns the repository owner-fence result %s',
    async (completed) => {
      const complete = vi.fn(async () => completed);
      const execute = makeExecuteCompleteOrderOutbox({
        repo: { complete },
        clock: { now: () => now },
      });
      await expect(execute(command)).resolves.toEqual({
        kind: 'success',
        value: { completed },
      });
      expect(complete).toHaveBeenCalledWith({ command, now });
    },
  );

  it('maps unknown failures and preserves explicit AppErrors', async () => {
    const unknown = makeExecuteCompleteOrderOutbox({
      repo: {
        complete: async () => {
          throw { fault: 'database unavailable' };
        },
      },
      clock: { now: () => now },
    });
    await expect(unknown(command)).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'order_outbox_completion_failed',
      status: 503,
    });

    const expected = configError({
      code: 'explicit_completion_fault',
      message: 'Explicit completion fault.',
    });
    const passThrough = makeExecuteCompleteOrderOutbox({
      repo: {
        complete: async () => {
          throw expected;
        },
      },
      clock: { now: () => now },
    });
    await expect(passThrough(command)).rejects.toBe(expected);
  });
});
