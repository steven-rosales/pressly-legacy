import { defineOperation } from '@pressly/cells';
import type { WebhookEventCompletion } from '../../../model/inbox.ts';
import { deadLetterEventContract } from './contract.ts';
import { makeExecuteDeadLetterEvent } from './execute.ts';
import {
  deadLetterEventOperationId,
  type DeadLetterEventCommand,
  type DeadLetterEventExpectedFailure,
  type DeadLetterEventRepository,
} from './types.ts';

export const deadLetterEventCellDeclaration = defineOperation<
  DeadLetterEventCommand,
  WebhookEventCompletion,
  DeadLetterEventExpectedFailure
>({
  kind: 'command',
  id: deadLetterEventOperationId,
  authentication: 'none',
  contract: deadLetterEventContract,
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    concurrencyKey: (input) => input.eventId,
    expectedVersion: (input) => input.attempt,
  },
  idempotency: { required: false },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'ingress.dead_letter_event' },
});

export const makeDeadLetterEventCell = (repo: DeadLetterEventRepository) =>
  defineOperation(
    deadLetterEventCellDeclaration,
    makeExecuteDeadLetterEvent(repo),
  );
