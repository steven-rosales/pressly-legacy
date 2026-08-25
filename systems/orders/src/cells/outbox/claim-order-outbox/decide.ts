import type {
  ClaimOrderOutboxCommand,
  ClaimOrderOutboxExpectedFailure,
} from './types.ts';

export const validateClaimOrderOutbox = (
  command: ClaimOrderOutboxCommand,
): ClaimOrderOutboxExpectedFailure | null => {
  if (
    command.workerId.trim() === '' ||
    !Number.isInteger(command.limit) ||
    command.limit < 1 ||
    command.limit > 100 ||
    command.leaseMs < 1_000
  )
    return {
      kind: 'validation',
      code: 'order_outbox_claim_invalid',
      message: 'The outbox claim request is invalid.',
    };

  return null;
};
