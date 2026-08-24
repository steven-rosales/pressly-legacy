import {
  defineBoundaryContract,
  defineCellContract,
  type DecodeResult,
} from '@pressly/cells';
import { z } from 'zod';
import {
  decodeIngressBoundary,
  encodeIngressBoundary,
} from '../../../model/boundary-contract.ts';
import type {
  LinkWebhookReceiptCommand,
  LinkWebhookReceiptExpectedFailure,
  LinkWebhookReceiptResult,
} from './types.ts';

const commandSchema = z
  .object({ receiptId: z.string().uuid(), eventId: z.string().uuid() })
  .strict();
const resultSchema = z.object({ linked: z.boolean() }).strict();
const failureSchema = z
  .object({
    kind: z.enum(['not_found', 'conflict']),
    code: z.enum([
      'webhook_quarantine_receipt_not_found',
      'webhook_quarantine_link_conflict',
    ]),
    message: z.string(),
    safeMessage: z.string(),
  })
  .strict();

export const linkWebhookReceiptContract = defineCellContract<
  LinkWebhookReceiptCommand,
  LinkWebhookReceiptResult,
  LinkWebhookReceiptExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<LinkWebhookReceiptCommand> =>
      decodeIngressBoundary(commandSchema, serialized),
    encode: (value) => ({ ...value }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(resultSchema, serialized),
    encode: (value) =>
      encodeIngressBoundary(resultSchema, value, {
        code: 'ingress_link_receipt_result_invalid',
        message: 'A link-receipt result violated its boundary contract.',
      }),
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(failureSchema, serialized),
    encode: (value) =>
      encodeIngressBoundary(failureSchema, value, {
        code: 'ingress_link_receipt_failure_invalid',
        message: 'A link-receipt failure violated its boundary contract.',
      }),
  }),
});
