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
import type { WebhookBacklog } from '../../../model/inbox.ts';
import type {
  MeasureWebhookBacklogExpectedFailure,
  MeasureWebhookBacklogInput,
} from './types.ts';

const inputSchema = z.object({}).strict();
const resultSchema = z
  .object({
    pendingCount: z.number().int().nonnegative(),
    oldestPendingAgeSeconds: z.number().nonnegative(),
  })
  .strict();

export const measureWebhookBacklogContract = defineCellContract<
  MeasureWebhookBacklogInput,
  WebhookBacklog,
  MeasureWebhookBacklogExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<MeasureWebhookBacklogInput> =>
      decodeIngressBoundary(inputSchema, serialized),
    encode: () => ({}),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(resultSchema, serialized),
    encode: (value) =>
      encodeIngressBoundary(resultSchema, value, {
        code: 'ingress_backlog_result_invalid',
        message: 'A webhook-backlog result violated its boundary contract.',
      }),
  }),
  failure: noExpectedFailureBoundary('measure-webhook-backlog'),
});
