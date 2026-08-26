import { defineOperation } from '@pressly/cells';
import type { CellDefinition } from '@pressly/cells';
import type { WebhookEventReadyV1 } from '../../../contracts/webhook-event-ready-v1.ts';
import { processInboundEventContract } from './contract.ts';
import {
  makeExecuteProcessInboundEvent,
  type ExecuteProcessInboundEvent,
} from './execute.ts';
import type {
  ProcessInboundEventDependencies,
  ProcessInboundEventExpectedFailure,
  ProcessInboundEventResult,
} from './types.ts';
import { processInboundEventOperationId } from './types.ts';
import { processInboundEventJobSurface } from './job.ts';
import { processInboundEventConsumedMessages } from './message.ts';

export const processInboundEventCellDeclaration = defineOperation<
  WebhookEventReadyV1,
  ProcessInboundEventResult,
  ProcessInboundEventExpectedFailure
>({
  kind: 'reaction',
  id: processInboundEventOperationId,
  authentication: 'none',
  contract: processInboundEventContract,
  consistency: {
    transaction: 'none',
    concurrency: 'partitioned',
    concurrencyKey: (input) =>
      `${input.source}:${input.subjectId ?? input.eventId}`,
  },
  idempotency: { required: true, key: (input) => input.eventId },
  consumes: processInboundEventConsumedMessages,
  emits: [],
  retry: {
    maxAttempts: 8,
    strategy: 'bounded-exponential-jitter',
    deadLetter: 'retain',
  },
  surfaces: [processInboundEventJobSurface],
  observability: { operation: 'ingress.process_inbound_event' },
});

export const makeProcessInboundEventCell = (
  deps: ProcessInboundEventDependencies,
): CellDefinition<
  'reaction',
  WebhookEventReadyV1,
  ProcessInboundEventResult,
  ProcessInboundEventExpectedFailure
> =>
  defineOperation(
    processInboundEventCellDeclaration,
    makeExecuteProcessInboundEvent(deps) satisfies ExecuteProcessInboundEvent,
  );
