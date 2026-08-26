import { defineOperation } from '@pressly/cells';
import type { ReplayDeadWebhookEventResult } from '../../../model/inbox.ts';
import { replayDeadEventContract } from './contract.ts';
import { replayDeadEventHttpSurface } from './http.ts';
import {
  makeExecuteReplayDeadEvent,
  type ReplayDeadEventDependencies,
} from './execute.ts';
import {
  replayDeadEventOperationId,
  type ReplayDeadEventCommand,
  type ReplayDeadEventExpectedFailure,
} from './types.ts';

export const replayDeadEventCellDeclaration = defineOperation<
  ReplayDeadEventCommand,
  ReplayDeadWebhookEventResult,
  ReplayDeadEventExpectedFailure
>({
  kind: 'command',
  id: replayDeadEventOperationId,
  authentication: 'required',
  contract: replayDeadEventContract,
  authorization: {
    capability: 'production:resources',
    timing: 'before-input',
  },
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.eventId,
  },
  idempotency: { required: false },
  surfaces: [replayDeadEventHttpSurface],
  emits: [],
  consumes: [],
  observability: { operation: 'ingress.replay_dead_event' },
});

export const makeReplayDeadEventCell = (deps: ReplayDeadEventDependencies) =>
  defineOperation(
    replayDeadEventCellDeclaration,
    makeExecuteReplayDeadEvent(deps),
  );
