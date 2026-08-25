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
  nullableUtcDateSchema,
  serializeDate,
} from '../../../model/boundary-contract.ts';
import type {
  IngestWebhookEventCommand,
  IngestWebhookEventResult,
} from '../../../model/inbox.ts';
import type { IngestEventExpectedFailure } from './types.ts';

const serializedCommandSchema = z
  .object({
    source: z.string(),
    eventType: z.string(),
    deduplicationKey: z.string(),
    subjectType: z.string(),
    subjectId: z.string().nullable(),
    sourceLocationId: z.string().nullable(),
    sourceOccurredAt: nullableUtcDateSchema,
    payload: jsonValueSchema,
    rawBodySha256: z.string(),
    disposition: z.enum(['process', 'ignore']),
  })
  .strict();

const resultSchema = z
  .object({
    eventId: z.string().uuid(),
    duplicate: z.boolean(),
    status: z.enum(['pending', 'ignored']),
  })
  .strict();

const decodeCommand = (
  serialized: unknown,
): DecodeResult<IngestWebhookEventCommand> =>
  decodeIngressBoundary(serializedCommandSchema, serialized);

export const ingestEventContract = defineCellContract<
  IngestWebhookEventCommand,
  IngestWebhookEventResult,
  IngestEventExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeCommand,
    encode: (command) => ({
      ...command,
      sourceOccurredAt:
        command.sourceOccurredAt === null
          ? null
          : serializeDate(
              command.sourceOccurredAt,
              'ingress_event_source_timestamp_invalid',
            ),
    }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(resultSchema, serialized),
    encode: (value) =>
      encodeIngressBoundary(resultSchema, value, {
        code: 'ingress_event_result_invalid',
        message: 'An ingest-event result violated its boundary contract.',
      }),
  }),
  failure: noExpectedFailureBoundary('ingest-event'),
});
