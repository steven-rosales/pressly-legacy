import type {
  IngestWebhookEventCommand as IngestWebhookEventWireCommand,
  IngestWebhookEventResult as IngestWebhookEventWireResult,
} from '../../contracts/webhook-ingestion-v1.ts';
import { type AppError } from '@pressly/errors/app-error';
import { conflictError, notFoundError } from '@pressly/errors/factories';
import type {
  IngestWebhookEventCommand,
  IngestWebhookEventResult,
} from '../../model/inbox.ts';
import type { LinkWebhookReceiptExpectedFailure } from '../../cells/quarantine/link-webhook-receipt/types.ts';

export const toIngestWebhookEventCommand = (
  command: IngestWebhookEventWireCommand,
): IngestWebhookEventCommand => ({
  source: command.source,
  eventType: command.eventType,
  deduplicationKey: command.deduplicationKey,
  subjectType: command.subjectType,
  subjectId: command.subjectId,
  sourceLocationId: command.sourceLocationId,
  sourceOccurredAt:
    command.sourceOccurredAt === null
      ? null
      : new Date(command.sourceOccurredAt),
  payload: command.payload,
  rawBodySha256: command.rawBodySha256,
  disposition: command.disposition,
});

export const toIngestWebhookEventResult = (
  result: IngestWebhookEventResult,
): IngestWebhookEventWireResult => ({
  eventId: result.eventId,
  duplicate: result.duplicate,
  status: result.status,
});

export const toLinkWebhookReceiptError = (
  failure: LinkWebhookReceiptExpectedFailure,
): AppError =>
  failure.code === 'webhook_quarantine_receipt_not_found'
    ? notFoundError({
        code: failure.code,
        message: failure.message,
        safeMessage: failure.message,
      })
    : conflictError({
        code: failure.code,
        message: failure.message,
        safeMessage: failure.message,
      });
