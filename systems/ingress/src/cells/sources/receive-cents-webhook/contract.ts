import { defineBoundaryContract, defineCellContract } from '@pressly/cells';
import { z } from 'zod';
import { decodeIngressBoundary } from '../../../model/boundary-contract.ts';
import type { IngestWebhookEventResult } from '../../../model/inbox.ts';
import type {
  ReceiveCentsWebhookCommand,
  ReceiveCentsWebhookFailure,
} from './types.ts';

const commandSchema = z
  .object({
    rawBodyBase64: z
      .string()
      .min(1)
      .max(512 * 1024)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      ),
  })
  .strict();
const resultSchema = z
  .object({
    eventId: z.string().uuid(),
    duplicate: z.boolean(),
    status: z.enum(['pending', 'ignored']),
  })
  .strict();
const failureSchema = z
  .object({
    kind: z.enum(['conflict', 'not_found', 'validation']),
    code: z.enum([
      'invalid_cents_webhook_body',
      'cents_webhook_body_too_large',
      'invalid_cents_webhook_envelope',
      'conflicting_cents_event_kind',
      'invalid_cents_order_payload',
      'invalid_cents_customer_payload',
      'invalid_cents_money',
      'conflicting_cents_unit_price',
      'webhook_quarantine_receipt_not_found',
      'webhook_quarantine_link_conflict',
    ]),
    message: z.string().min(1),
    safeMessage: z.string().min(1),
  })
  .strict();

export const receiveCentsWebhookContract = defineCellContract<
  ReceiveCentsWebhookCommand,
  IngestWebhookEventResult,
  ReceiveCentsWebhookFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(commandSchema, serialized),
    encode: (value) => ({ ...value }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(resultSchema, serialized),
    encode: (value) => ({ ...value }),
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(failureSchema, serialized),
    encode: (value) => ({ ...value }),
  }),
});
