import { configError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteRetryOrderOutbox } from './execute.ts';

const command = {
  eventId: 'event-1',
  workerId: 'worker-1',
  availableAt: new Date('2026-08-22T16:01:00.000Z'),
  errorCode: 'temporary_failure',
  errorMessage: 'Temporary downstream failure.',
};

describe('execute retry Order outbox', () => {
  it.each([true, false])(
    'returns the repository owner-fence result %s',
    async (retried) => {
      const retry = vi.fn(async () => retried);
      const execute = makeExecuteRetryOrderOutbox({ retry });
      await expect(execute(command)).resolves.toEqual({
        kind: 'success',
        value: { retried },
      });
      expect(retry).toHaveBeenCalledWith(command);
    },
  );

  it('maps unknown failures and preserves explicit AppErrors', async () => {
    const unknown = makeExecuteRetryOrderOutbox({
      retry: async () => {
        throw { fault: 'database unavailable' };
      },
    });
    await expect(unknown(command)).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'order_outbox_retry_failed',
      status: 503,
    });

    const expected = configError({
      code: 'explicit_retry_fault',
      message: 'Explicit retry fault.',
    });
    const passThrough = makeExecuteRetryOrderOutbox({
      retry: async () => {
        throw expected;
      },
    });
    await expect(passThrough(command)).rejects.toBe(expected);
  });
});
