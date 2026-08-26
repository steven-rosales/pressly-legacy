import { defineOperation } from '@pressly/cells';
import type {
  IngestWebhookEventCommand,
  IngestWebhookEventResult,
} from '../../../model/inbox.ts';
import { ingestEventContract } from './contract.ts';
import {
  makeExecuteIngestEvent,
  type IngestEventDependencies,
} from './execute.ts';
import {
  ingestEventOperationId,
  type IngestEventExpectedFailure,
} from './types.ts';
import { ingestEventMessages } from './message.ts';

export const ingestEventCellDeclaration = defineOperation<
  IngestWebhookEventCommand,
  IngestWebhookEventResult,
  IngestEventExpectedFailure
>({
  kind: 'command',
  id: ingestEventOperationId,
  authentication: 'none',
  contract: ingestEventContract,
  consistency: { transaction: 'required', concurrency: 'partitioned' },
  idempotency: {
    required: true,
    key: (input) => `${input.source}:${input.deduplicationKey}`,
    fingerprint: (input) => input.rawBodySha256,
  },
  surfaces: [],
  emits: ingestEventMessages,
  consumes: [],
  observability: { operation: 'ingress.ingest_event' },
});

export const makeIngestEventCell = (deps: IngestEventDependencies) =>
  defineOperation(ingestEventCellDeclaration, makeExecuteIngestEvent(deps));
