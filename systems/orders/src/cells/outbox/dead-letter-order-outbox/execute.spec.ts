import { configError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteDeadLetterOrderOutbox } from './execute.ts';

const now = new Date('2026-08-22T16:00:00.000Z');
const command = {
  eventId: 'event-1',
  workerId: 'worker-1',
  errorCode: 'invalid_event',
  errorMessage: 'Invalid durable event.',
};

describe('execute dead-letter Order outbox', () => {
  it.each([true, false])(
    'returns the repository owner-fence result %s',
    async (deadLettered) => {
      const deadLetter = vi.fn(async () => deadLettered);
      const clock = { now: vi.fn(() => now) };
      const execute = makeExecuteDeadLetterOrderOutbox({
        repo: { deadLetter },
        clock,
      });
      await expect(execute(command)).resolves.toEqual({
        kind: 'success',
        value: { deadLettered },
      });
      expect(deadLetter).toHaveBeenCalledWith({ command, now });
    },
  );

  it('returns invalid commands before clock or persistence', async () => {
    const deadLetter = vi.fn(async () => true);
    const clock = { now: vi.fn(() => now) };
    const execute = makeExecuteDeadLetterOrderOutbox({
      repo: { deadLetter },
      clock,
    });
    await expect(execute({ ...command, errorCode: ' ' })).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'validation',
        code: 'order_outbox_dead_letter_invalid',
        message: 'The outbox dead-letter request is invalid.',
      },
    });
    expect(clock.now).not.toHaveBeenCalled();
    expect(deadLetter).not.toHaveBeenCalled();
  });

  it('maps unknown failures and preserves explicit AppErrors', async () => {
    const unknown = makeExecuteDeadLetterOrderOutbox({
      repo: {
        deadLetter: async () => {
          throw { fault: 'database unavailable' };
        },
      },
      clock: { now: () => now },
    });
    await expect(unknown(command)).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'order_outbox_dead_letter_failed',
      status: 503,
    });

    const expected = configError({
      code: 'explicit_dead_letter_fault',
      message: 'Explicit dead-letter fault.',
    });
    const passThrough = makeExecuteDeadLetterOrderOutbox({
      repo: {
        deadLetter: async () => {
          throw expected;
        },
      },
      clock: { now: () => now },
    });
    await expect(passThrough(command)).rejects.toBe(expected);
  });
});
