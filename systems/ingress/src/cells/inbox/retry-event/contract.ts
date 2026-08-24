import {
  defineBoundaryContract,
  defineCellContract,
  type DecodeResult,
} from '@pressly/cells';
import { z } from 'zod';
import {
  decodeIngressBoundary,
  noExpectedFailureBoundary,
  serializeDate,
  utcDateSchema,
} from '../../../model/boundary-contract.ts';
import type { WebhookEventCompletion } from '../../../model/inbox.ts';
import type { RetryEventCommand, RetryEventExpectedFailure } from './types.ts';

const commandSchema = z
  .object({
    eventId: z.string().uuid(),
    workerId: z.string().min(1),
    attempt: z.number().int().positive(),
    availableAt: utcDateSchema,
    code: z.string(),
    message: z.string(),
  })
  .strict();
const resultSchema = z.enum(['applied', 'lease_lost']);

export const retryEventContract = defineCellContract<
  RetryEventCommand,
  WebhookEventCompletion,
  RetryEventExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<RetryEventCommand> =>
      decodeIngressBoundary(commandSchema, serialized),
    encode: (value) => ({
      ...value,
      availableAt: serializeDate(
        value.availableAt,
        'ingress_retry_available_timestamp_invalid',
      ),
    }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(resultSchema, serialized),
    encode: (value) => value,
  }),
  failure: noExpectedFailureBoundary('retry-event'),
});
