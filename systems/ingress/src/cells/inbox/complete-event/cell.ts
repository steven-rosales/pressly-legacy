import { defineOperation } from '@pressly/cells';
import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../../../model/inbox.ts';
import { completeEventContract } from './contract.ts';
import {
  makeExecuteCompleteEvent,
  type CompleteEventDependencies,
} from './execute.ts';
import {
  completeEventOperationId,
  type CompleteEventExpectedFailure,
} from './types.ts';

export const completeEventCellDeclaration = defineOperation<
  WebhookEventClaim,
  WebhookEventCompletion,
  CompleteEventExpectedFailure
>({
  kind: 'command',
  id: completeEventOperationId,
  authentication: 'none',
  contract: completeEventContract,
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
  observability: { operation: 'ingress.complete_event' },
});

export const makeCompleteEventCell = (deps: CompleteEventDependencies) =>
  defineOperation(completeEventCellDeclaration, makeExecuteCompleteEvent(deps));
