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
import type { WebhookEventCompletion } from '../../../model/inbox.ts';
import type {
  DeadLetterEventCommand,
  DeadLetterEventExpectedFailure,
} from './types.ts';

const commandSchema = z
  .object({
    eventId: z.string().uuid(),
    workerId: z.string().min(1),
    attempt: z.number().int().positive(),
    code: z.string(),
    message: z.string(),
  })
  .strict();
const resultSchema = z.enum(['applied', 'lease_lost']);

export const deadLetterEventContract = defineCellContract<
  DeadLetterEventCommand,
  WebhookEventCompletion,
  DeadLetterEventExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<DeadLetterEventCommand> =>
      decodeIngressBoundary(commandSchema, serialized),
    encode: (value) => ({ ...value }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(resultSchema, serialized),
    encode: (value) => value,
  }),
  failure: noExpectedFailureBoundary('dead-letter-event'),
});
