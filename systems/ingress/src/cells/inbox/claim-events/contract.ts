import { jsonValueSchema } from '@pressly/codec/zod';
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
  serializeDate,
  utcIsoSchema,
} from '../../../model/boundary-contract.ts';
import type { ClaimedWebhookEvent } from '../../../model/inbox.ts';
import type {
  ClaimEventsCommand,
  ClaimEventsExpectedFailure,
  ClaimEventsResult,
} from './types.ts';

const commandSchema = z
  .object({
    workerId: z.string().min(1),
    leaseMs: z.number().int().positive(),
    limit: z.number().int().positive(),
  })
  .strict();

const serializedClaimSchema = z
  .object({
    eventId: z.string().uuid(),
    workerId: z.string(),
    attempt: z.number().int().positive(),
    source: z.string(),
    eventType: z.string(),
    subjectType: z.string(),
    subjectId: z.string().nullable(),
    sourceLocationId: z.string().nullable(),
    sourceOccurredAt: utcIsoSchema.nullable(),
    receivedAt: utcIsoSchema,
    payload: jsonValueSchema,
    payloadHash: z.string(),
    recoveredLease: z.boolean(),
  })
  .strict();
const resultSchema = z.array(serializedClaimSchema);

const claimedEventFromSerialized = (
  value: z.infer<typeof serializedClaimSchema>,
): ClaimedWebhookEvent => ({
  ...value,
  sourceOccurredAt:
    value.sourceOccurredAt === null ? null : new Date(value.sourceOccurredAt),
  receivedAt: new Date(value.receivedAt),
});

const serializeClaimedEvent = (value: ClaimedWebhookEvent) => ({
  ...value,
  sourceOccurredAt:
    value.sourceOccurredAt === null
      ? null
      : serializeDate(
          value.sourceOccurredAt,
          'ingress_claim_source_timestamp_invalid',
        ),
  receivedAt: serializeDate(
    value.receivedAt,
    'ingress_claim_received_timestamp_invalid',
  ),
});

export const claimEventsContract = defineCellContract<
  ClaimEventsCommand,
  ClaimEventsResult,
  ClaimEventsExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<ClaimEventsCommand> =>
      decodeIngressBoundary(commandSchema, serialized),
    encode: (value) => ({ ...value }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const decoded = decodeIngressBoundary(resultSchema, serialized);
      return decoded.kind === 'invalid'
        ? decoded
        : {
            kind: 'valid',
            value: Object.freeze(decoded.value.map(claimedEventFromSerialized)),
          };
    },
    encode: (value) =>
      encodeIngressBoundary(resultSchema, value.map(serializeClaimedEvent), {
        code: 'ingress_claim_result_invalid',
        message: 'A claim-events result violated its boundary contract.',
      }),
  }),
  failure: noExpectedFailureBoundary('claim-events'),
});
