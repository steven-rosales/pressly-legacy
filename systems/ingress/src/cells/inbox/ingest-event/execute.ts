import type { JsonValue } from '@pressly/codec';
import { canonicalSha256 } from '@pressly/codec/node';
import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import type {
  IngestWebhookEventCommand,
  IngestWebhookEventResult,
} from '../../../model/inbox.ts';
import type {
  IngestEventClock,
  IngestEventExpectedFailure,
  IngestEventRepository,
} from './types.ts';

const payloadHash = (payload: JsonValue): string | null => {
  if (payload === null) return null;
  try {
    return canonicalSha256(payload);
  } catch (error) {
    throw mapUnknownError(error, (cause) =>
      invariantViolationError({
        code: 'webhook_payload_hash_failed',
        message: 'The normalized webhook payload could not be hashed.',
        safeMessage: 'The normalized webhook payload is inconsistent.',
        cause,
      }),
    );
  }
};

export type IngestEventDependencies = Readonly<{
  repo: IngestEventRepository;
  clock: IngestEventClock;
}>;

export const makeExecuteIngestEvent =
  (deps: IngestEventDependencies) =>
  async (
    command: IngestWebhookEventCommand,
  ): Promise<
    CellOutcome<IngestWebhookEventResult, IngestEventExpectedFailure>
  > => {
    const hash = payloadHash(command.payload);
    try {
      const ingested = await deps.repo.ingest({
        command,
        payloadHash: hash,
        now: deps.clock.now(),
      });
      return {
        kind: 'success',
        value: {
          eventId: ingested.eventId,
          duplicate: ingested.duplicate,
          status: command.disposition === 'ignore' ? 'ignored' : 'pending',
        },
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'webhook_event_ingestion_failed',
          message: 'The webhook event could not be stored durably.',
          safeMessage: 'The webhook event could not be stored durably.',
          status: 503,
          cause,
        }),
      );
    }
  };
