import { describe, expect, it } from 'vitest';
import { validateDeadLetterOrderOutbox } from './decide.ts';

const valid = () => ({
  eventId: 'event-1',
  workerId: 'worker-1',
  errorCode: 'invalid_event',
  errorMessage: 'Invalid durable event.',
});

describe('validate dead-letter Order outbox', () => {
  it('accepts the deployed terminalization envelope', () => {
    expect(validateDeadLetterOrderOutbox(valid())).toBeNull();
  });

  it.each(['eventId', 'workerId', 'errorCode', 'errorMessage'] as const)(
    'rejects blank %s',
    (field) => {
      expect(
        validateDeadLetterOrderOutbox({ ...valid(), [field]: '  ' }),
      ).toEqual({
        kind: 'validation',
        code: 'order_outbox_dead_letter_invalid',
        message: 'The outbox dead-letter request is invalid.',
      });
    },
  );
});
