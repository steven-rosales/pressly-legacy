import {
  decode,
  defineBoundaryContract,
  defineCellContract,
} from '@pressly/cells';
import { z } from 'zod';
import {
  contractIssues,
  decodeCustomerSummaryContractValue,
  encodeCustomerSummaryContractValue,
} from '../../../model/customer-contract.ts';
import type { CustomerSummary } from '../../../model/customer.ts';
import type { GetCustomerExpectedFailure, GetCustomerQuery } from './types.ts';

const querySchema = z
  .object({ businessId: z.string(), userId: z.string() })
  .strict();

const failureSchema = z.union([
  z
    .object({
      kind: z.literal('validation'),
      code: z.literal('user_get_invalid'),
    })
    .strict(),
  z
    .object({ kind: z.literal('not_found'), code: z.literal('user_not_found') })
    .strict(),
]);

export const getCustomerContract = defineCellContract<
  GetCustomerQuery,
  CustomerSummary,
  GetCustomerExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const parsed = querySchema.safeParse(serialized);
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(contractIssues(parsed.error.issues));
    },
    encode: (query) => ({ ...query }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeCustomerSummaryContractValue,
    encode: encodeCustomerSummaryContractValue,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const parsed = failureSchema.safeParse(serialized);
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(contractIssues(parsed.error.issues));
    },
    encode: (failure) => ({ ...failure }),
  }),
});
