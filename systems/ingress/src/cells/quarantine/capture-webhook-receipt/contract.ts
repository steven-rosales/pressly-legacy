import {
  defineBoundaryContract,
  defineCellContract,
  type DecodeResult,
} from '@pressly/cells';
import { z } from 'zod';
import {
  decodeIngressBoundary,
  encodeIngressBoundary,
  noExpectedFailureBoundary,
} from '../../../model/boundary-contract.ts';
import type {
  CaptureWebhookReceiptCommand,
  CaptureWebhookReceiptResult,
} from '../../../model/quarantine.ts';
import type { CaptureWebhookReceiptExpectedFailure } from './types.ts';

const normalizationSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('accepted') }).strict(),
  z.object({ outcome: z.literal('rejected'), errorCode: z.string() }).strict(),
]);
const inputSchema = z
  .object({
    source: z.string(),
    rawBodySha256: z.string(),
    adapterVersion: z.string(),
    eventType: z.string().nullable(),
    payloadCiphertext: z.string(),
    normalization: normalizationSchema,
  })
  .strict();
const outputSchema = z
  .object({ receiptId: z.string().uuid(), duplicate: z.boolean() })
  .strict();

export const captureWebhookReceiptContract = defineCellContract<
  CaptureWebhookReceiptCommand,
  CaptureWebhookReceiptResult,
  CaptureWebhookReceiptExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<CaptureWebhookReceiptCommand> =>
      decodeIngressBoundary(inputSchema, serialized),
    encode: (value) => ({
      ...value,
      normalization: { ...value.normalization },
    }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(outputSchema, serialized),
    encode: (value) =>
      encodeIngressBoundary(outputSchema, value, {
        code: 'ingress_capture_receipt_result_invalid',
        message: 'A capture-receipt result violated its boundary contract.',
      }),
  }),
  failure: noExpectedFailureBoundary('capture-webhook-receipt'),
});
