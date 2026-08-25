import type { CellOutcome } from '@pressly/cells';
import type {
  CaptureWebhookReceiptCommand,
  CaptureWebhookReceiptResult,
} from '../../../model/quarantine.ts';
import type {
  IngestWebhookEventCommand,
  IngestWebhookEventResult,
} from '../../../model/inbox.ts';
import type {
  CentsWebhookNormalizationErrorCode,
  CentsWebhookPayloadCipher,
} from '../../../sources/cents/public.ts';

export const receiveCentsWebhookOperationId =
  'ingress.receive-cents-webhook.v1' as const;

export type ReceiveCentsWebhookCommand = Readonly<{
  rawBodyBase64: string;
}>;

export type ReceiveCentsWebhookFailure = Readonly<{
  kind: 'conflict' | 'not_found' | 'validation';
  code:
    | 'invalid_cents_webhook_body'
    | CentsWebhookNormalizationErrorCode
    | 'webhook_quarantine_receipt_not_found'
    | 'webhook_quarantine_link_conflict';
  message: string;
  safeMessage: string;
}>;

export type ReceiveCentsWebhookDependencies = Readonly<{
  captureReceipt?: (
    command: CaptureWebhookReceiptCommand,
  ) => Promise<CellOutcome<CaptureWebhookReceiptResult, never>>;
  ingestEvent: (
    command: IngestWebhookEventCommand,
  ) => Promise<CellOutcome<IngestWebhookEventResult, never>>;
  linkReceipt?: (
    command: Readonly<{ receiptId: string; eventId: string }>,
  ) => Promise<
    CellOutcome<
      Readonly<{ linked: boolean }>,
      Readonly<{
        kind: 'not_found' | 'conflict';
        code:
          | 'webhook_quarantine_receipt_not_found'
          | 'webhook_quarantine_link_conflict';
        message: string;
        safeMessage: string;
      }>
    >
  >;
  payloadCipher?: CentsWebhookPayloadCipher;
}>;
