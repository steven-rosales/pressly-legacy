import { defineOperation } from '@pressly/cells';
import type { WebhookEventCompletion } from '../../../model/inbox.ts';
import { retryEventContract } from './contract.ts';
import { makeExecuteRetryEvent } from './execute.ts';
import {
  retryEventOperationId,
  type RetryEventCommand,
  type RetryEventExpectedFailure,
  type RetryEventRepository,
} from './types.ts';

export const retryEventCellDeclaration = defineOperation<
  RetryEventCommand,
  WebhookEventCompletion,
  RetryEventExpectedFailure
>({
  kind: 'command',
  id: retryEventOperationId,
  authentication: 'none',
  contract: retryEventContract,
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
  observability: { operation: 'ingress.retry_event' },
});

export const makeRetryEventCell = (repo: RetryEventRepository) =>
  defineOperation(retryEventCellDeclaration, makeExecuteRetryEvent(repo));
