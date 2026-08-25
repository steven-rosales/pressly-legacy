import type {
  DeadLetterOrderOutboxCommand,
  DeadLetterOrderOutboxExpectedFailure,
} from './types.ts';

export const validateDeadLetterOrderOutbox = (
  command: DeadLetterOrderOutboxCommand,
): DeadLetterOrderOutboxExpectedFailure | null => {
  if (
    command.eventId.trim() !== '' &&
    command.workerId.trim() !== '' &&
    command.errorCode.trim() !== '' &&
    command.errorMessage.trim() !== ''
  )
    return null;

  return {
    kind: 'validation',
    code: 'order_outbox_dead_letter_invalid',
    message: 'The outbox dead-letter request is invalid.',
  };
};
