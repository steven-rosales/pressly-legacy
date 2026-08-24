import {
  defineBoundaryContract,
  defineCellContract,
  type DecodeResult,
} from '@pressly/cells';
import { z } from 'zod';
import {
  decodeIngressBoundary,
  noExpectedFailureBoundary,
} from '../../../model/boundary-contract.ts';
import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../../../model/inbox.ts';
import type { CompleteEventExpectedFailure } from './types.ts';

const commandSchema = z
  .object({
    eventId: z.string().uuid(),
    workerId: z.string().min(1),
    attempt: z.number().int().positive(),
  })
  .strict();
const resultSchema = z.enum(['applied', 'lease_lost']);

export const completeEventContract = defineCellContract<
  WebhookEventClaim,
  WebhookEventCompletion,
  CompleteEventExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<WebhookEventClaim> =>
      decodeIngressBoundary(commandSchema, serialized),
    encode: (value) => ({ ...value }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(resultSchema, serialized),
    encode: (value) => value,
  }),
  failure: noExpectedFailureBoundary('complete-event'),
});
