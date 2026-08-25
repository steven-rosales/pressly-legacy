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
import type { ReplayDeadWebhookEventResult } from '../../../model/inbox.ts';
import type {
  ReplayDeadEventCommand,
  ReplayDeadEventExpectedFailure,
} from './types.ts';

const commandSchema = z.object({ eventId: z.string().uuid() }).strict();
const resultSchema = z
  .object({
    eventId: z.string().uuid(),
    outcome: z.enum(['queued', 'already_queued']),
  })
  .strict();
const failureSchema = z
  .object({
    kind: z.enum(['not_found', 'conflict']),
    code: z.enum(['webhook_event_not_found', 'webhook_event_not_replayable']),
    message: z.string(),
    safeMessage: z.string(),
  })
  .strict();

export const replayDeadEventContract = defineCellContract<
  ReplayDeadEventCommand,
  ReplayDeadWebhookEventResult,
  ReplayDeadEventExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<ReplayDeadEventCommand> =>
      decodeIngressBoundary(commandSchema, serialized),
    encode: (value) => ({ ...value }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(resultSchema, serialized),
    encode: (value) =>
      encodeIngressBoundary(resultSchema, value, {
        code: 'ingress_replay_result_invalid',
        message: 'A replay-dead-event result violated its boundary contract.',
      }),
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(failureSchema, serialized),
    encode: (value) =>
      encodeIngressBoundary(failureSchema, value, {
        code: 'ingress_replay_failure_invalid',
        message: 'A replay-dead-event failure violated its boundary contract.',
      }),
  }),
});
