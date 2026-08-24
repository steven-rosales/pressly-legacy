import type { JsonValue } from '@pressly/codec';
import { jsonValueSchema } from '@pressly/codec/zod';
import {
  defineBoundaryContract,
  defineMessageContract,
  type DecodeResult,
} from '@pressly/cells';
import { z } from 'zod';
import {
  decodeIngressBoundary,
  encodeIngressBoundary,
  serializeDate,
  utcIsoSchema,
} from '../model/boundary-contract.ts';

export type WebhookEventReadyV1 = Readonly<{
  eventId: string;
  source: string;
  eventType: string;
  subjectType: string;
  subjectId: string | null;
  sourceLocationId: string | null;
  sourceOccurredAt: Date | null;
  receivedAt: Date;
  payload: JsonValue;
  payloadHash: string;
}>;

const serializedWebhookEventReadyV1Schema = z
  .object({
    eventId: z.string().uuid(),
    source: z.string(),
    eventType: z.string(),
    subjectType: z.string(),
    subjectId: z.string().nullable(),
    sourceLocationId: z.string().nullable(),
    sourceOccurredAt: utcIsoSchema.nullable(),
    receivedAt: utcIsoSchema,
    payload: jsonValueSchema,
    payloadHash: z.string(),
  })
  .strict();

export const webhookEventReadyV1PayloadContract =
  defineBoundaryContract<WebhookEventReadyV1>({
    version: 1,
    decode: (serialized): DecodeResult<WebhookEventReadyV1> => {
      const decoded = decodeIngressBoundary(
        serializedWebhookEventReadyV1Schema,
        serialized,
      );
      return decoded.kind === 'invalid'
        ? decoded
        : {
            kind: 'valid',
            value: {
              ...decoded.value,
              sourceOccurredAt:
                decoded.value.sourceOccurredAt === null
                  ? null
                  : new Date(decoded.value.sourceOccurredAt),
              receivedAt: new Date(decoded.value.receivedAt),
            },
          };
    },
    encode: (value) =>
      encodeIngressBoundary(
        serializedWebhookEventReadyV1Schema,
        {
          ...value,
          sourceOccurredAt:
            value.sourceOccurredAt === null
              ? null
              : serializeDate(
                  value.sourceOccurredAt,
                  'ingress_webhook_event_ready_source_timestamp_invalid',
                ),
          receivedAt: serializeDate(
            value.receivedAt,
            'ingress_webhook_event_ready_received_timestamp_invalid',
          ),
        },
        {
          code: 'ingress_webhook_event_ready_invalid',
          message: 'A webhook-event-ready message violated its contract.',
        },
      ),
  });

export const webhookEventReadyV1MessageContract = defineMessageContract({
  type: 'ingress.webhook-event-ready',
  version: 1,
  payload: webhookEventReadyV1PayloadContract,
});
