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
import type {
  PurgeExpiredWebhookReceiptsExpectedFailure,
  PurgeExpiredWebhookReceiptsInput,
  PurgeExpiredWebhookReceiptsResult,
} from './types.ts';

const inputSchema = z.object({}).strict();
const resultSchema = z
  .object({ purgedCount: z.number().int().nonnegative() })
  .strict();

export const purgeExpiredWebhookReceiptsContract = defineCellContract<
  PurgeExpiredWebhookReceiptsInput,
  PurgeExpiredWebhookReceiptsResult,
  PurgeExpiredWebhookReceiptsExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<PurgeExpiredWebhookReceiptsInput> =>
      decodeIngressBoundary(inputSchema, serialized),
    encode: () => ({}),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => decodeIngressBoundary(resultSchema, serialized),
    encode: (value) =>
      encodeIngressBoundary(resultSchema, value, {
        code: 'ingress_purge_receipts_result_invalid',
        message: 'A purge-receipts result violated its boundary contract.',
      }),
  }),
  failure: noExpectedFailureBoundary('purge-expired-webhook-receipts'),
});
