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
import {
  webhookEventReadyV1PayloadContract,
  type WebhookEventReadyV1,
} from '../../../contracts/webhook-event-ready-v1.ts';
import type {
  ProcessInboundEventExpectedFailure,
  ProcessInboundEventResult,
} from './types.ts';

const outputSchema = z.object({ acknowledged: z.literal(true) }).strict();
const permanentFailureSchema = z
  .object({
    kind: z.literal('validation'),
    classification: z.enum(['missing_consumer', 'orders', 'stored_event']),
    code: z.string(),
    message: z.string(),
    safeMessage: z.string(),
    status: z.union([z.literal(400), z.literal(422)]),
    retryable: z.literal(false),
  })
  .strict();
const projectionPendingFailureSchema = z
  .object({
    kind: z.literal('external_service'),
    code: z.literal('production_projection_pending'),
    message: z.string(),
    safeMessage: z.string(),
    status: z.literal(503),
    retryable: z.literal(true),
  })
  .strict();
const failureSchema = z.discriminatedUnion('kind', [
  permanentFailureSchema,
  projectionPendingFailureSchema,
]);

export const processInboundEventContract = defineCellContract<
  WebhookEventReadyV1,
  ProcessInboundEventResult,
  ProcessInboundEventExpectedFailure
>({
  input: webhookEventReadyV1PayloadContract,
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<ProcessInboundEventResult> =>
      decodeIngressBoundary(outputSchema, serialized),
    encode: (value) =>
      encodeIngressBoundary(outputSchema, value, {
        code: 'ingress_process_inbound_event_result_invalid',
        message:
          'A process-inbound-event result violated its boundary contract.',
      }),
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<ProcessInboundEventExpectedFailure> =>
      decodeIngressBoundary(failureSchema, serialized),
    encode: (value) =>
      encodeIngressBoundary(failureSchema, value, {
        code: 'ingress_process_inbound_event_failure_invalid',
        message:
          'A process-inbound-event failure violated its boundary contract.',
      }),
  }),
});
