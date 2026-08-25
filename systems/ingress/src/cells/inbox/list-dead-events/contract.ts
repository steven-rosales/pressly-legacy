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
import type {
  DeadWebhookEvent,
  DeadWebhookEventsResult,
  ListDeadWebhookEventsQuery,
} from '../../../model/inbox.ts';
import type { ListDeadEventsExpectedFailure } from './types.ts';

const inputSchema = z
  .object({
    source: z.string().optional(),
    afterEventId: z.string().uuid().optional(),
    limit: z.number().int().positive(),
  })
  .strict();
const serializedItemSchema = z
  .object({
    eventId: z.string().uuid(),
    source: z.string(),
    eventType: z.string(),
    subjectType: z.string(),
    subjectId: z.string().nullable(),
    sourceLocationId: z.string().nullable(),
    sourceOccurredAt: utcIsoSchema.nullable(),
    attempts: z.number().int().nonnegative(),
    lastErrorCode: z.string().nullable(),
    receivedAt: utcIsoSchema,
  })
  .strict();
const serializedResultSchema = z
  .object({
    items: z.array(serializedItemSchema),
    nextEventId: z.string().uuid().nullable(),
    asOf: utcIsoSchema,
  })
  .strict();

const decodeResult = (serialized: unknown) => {
  const decoded = decodeIngressBoundary(serializedResultSchema, serialized);
  if (decoded.kind === 'invalid') return decoded;
  return {
    kind: 'valid' as const,
    value: {
      items: Object.freeze(
        decoded.value.items.map(
          (item): DeadWebhookEvent => ({
            ...item,
            sourceOccurredAt:
              item.sourceOccurredAt === null
                ? null
                : new Date(item.sourceOccurredAt),
            receivedAt: new Date(item.receivedAt),
          }),
        ),
      ),
      nextEventId: decoded.value.nextEventId,
      asOf: new Date(decoded.value.asOf),
    },
  };
};

const encodeItem = (item: DeadWebhookEvent) => ({
  ...item,
  sourceOccurredAt:
    item.sourceOccurredAt === null
      ? null
      : serializeDate(
          item.sourceOccurredAt,
          'ingress_dead_event_source_timestamp_invalid',
        ),
  receivedAt: serializeDate(
    item.receivedAt,
    'ingress_dead_event_received_timestamp_invalid',
  ),
});

export const listDeadEventsContract = defineCellContract<
  ListDeadWebhookEventsQuery,
  DeadWebhookEventsResult,
  ListDeadEventsExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<ListDeadWebhookEventsQuery> => {
      const decoded = decodeIngressBoundary(inputSchema, serialized);
      if (decoded.kind === 'invalid') return decoded;
      return {
        kind: 'valid',
        value: {
          ...(decoded.value.source === undefined
            ? {}
            : { source: decoded.value.source }),
          ...(decoded.value.afterEventId === undefined
            ? {}
            : { afterEventId: decoded.value.afterEventId }),
          limit: decoded.value.limit,
        },
      };
    },
    encode: (value) => ({ ...value }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeResult,
    encode: (value) =>
      encodeIngressBoundary(
        serializedResultSchema,
        {
          items: value.items.map(encodeItem),
          nextEventId: value.nextEventId,
          asOf: serializeDate(value.asOf, 'ingress_dead_event_as_of_invalid'),
        },
        {
          code: 'ingress_dead_event_list_result_invalid',
          message: 'A dead-event list result violated its boundary contract.',
        },
      ),
  }),
  failure: noExpectedFailureBoundary('list-dead-events'),
});
