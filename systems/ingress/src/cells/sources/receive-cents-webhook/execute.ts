import type { CellOutcome } from '@pressly/cells';
import { decodeBase64Bytes } from '@pressly/codec';
import { invariantViolationError } from '@pressly/errors/factories';
import type { IngestWebhookEventResult } from '../../../model/inbox.ts';
import {
  CENTS_WEBHOOK_ADAPTER_VERSION,
  hashCentsWebhookRawBody,
  normalizeCentsWebhook,
  toCentsWebhookEventCommand,
  toIngestWebhookEventCommand,
} from '../../../sources/cents/public.ts';
import type {
  ReceiveCentsWebhookCommand,
  ReceiveCentsWebhookDependencies,
  ReceiveCentsWebhookFailure,
} from './types.ts';

const validationFailure = (
  code: ReceiveCentsWebhookFailure['code'],
  message: string,
): ReceiveCentsWebhookFailure => ({
  kind: 'validation',
  code,
  message,
  safeMessage: 'The vendor webhook body is invalid.',
});

const parseJson = (rawBody: Uint8Array): unknown => {
  try {
    return JSON.parse(new TextDecoder().decode(rawBody)) as unknown;
  } catch {
    return undefined;
  }
};

export const makeExecuteReceiveCentsWebhook =
  (dependencies: ReceiveCentsWebhookDependencies) =>
  async (
    command: ReceiveCentsWebhookCommand,
  ): Promise<
    CellOutcome<IngestWebhookEventResult, ReceiveCentsWebhookFailure>
  > => {
    const rawBody = decodeBase64Bytes(command.rawBodyBase64);
    if (rawBody === null)
      return {
        kind: 'failure',
        failure: validationFailure(
          'invalid_cents_webhook_body',
          'Cents webhook body encoding was invalid.',
        ),
      };
    const payload = parseJson(rawBody);
    const normalized =
      payload === undefined
        ? {
            ok: false as const,
            error: {
              code: 'invalid_cents_webhook_body' as const,
              message: 'Cents webhook body was not valid JSON.',
            },
          }
        : normalizeCentsWebhook({ payload, rawBody });

    let receiptId: string | null = null;
    if (
      dependencies.captureReceipt !== undefined &&
      dependencies.payloadCipher !== undefined
    ) {
      const captured = await dependencies.captureReceipt({
        source: 'cents',
        rawBodySha256: hashCentsWebhookRawBody(rawBody),
        adapterVersion: CENTS_WEBHOOK_ADAPTER_VERSION,
        eventType: normalized.ok ? normalized.value.receipt.eventKind : null,
        payloadCiphertext: dependencies.payloadCipher.encrypt(rawBody),
        normalization: normalized.ok
          ? { outcome: 'accepted' }
          : { outcome: 'rejected', errorCode: normalized.error.code },
      });
      if (captured.kind === 'failure')
        throw invariantViolationError({
          code: 'webhook_quarantine_capture_unexpected_failure',
          message:
            'Webhook quarantine capture returned an undeclared expected failure.',
          safeMessage:
            'The webhook diagnostic receipt could not be stored durably.',
        });
      receiptId = captured.value.receiptId;
    }

    if (!normalized.ok)
      return {
        kind: 'failure',
        failure: validationFailure(
          normalized.error.code,
          normalized.error.message,
        ),
      };

    const ingested = await dependencies.ingestEvent(
      toIngestWebhookEventCommand(toCentsWebhookEventCommand(normalized.value)),
    );
    if (ingested.kind === 'failure')
      throw invariantViolationError({
        code: 'webhook_ingestion_unexpected_failure',
        message: 'Webhook ingestion returned an undeclared expected failure.',
        safeMessage: 'The webhook event could not be ingested.',
      });

    if (receiptId !== null && dependencies.linkReceipt !== undefined) {
      const linked = await dependencies.linkReceipt({
        receiptId,
        eventId: ingested.value.eventId,
      });
      if (linked.kind === 'failure') return linked;
    }

    return ingested;
  };
