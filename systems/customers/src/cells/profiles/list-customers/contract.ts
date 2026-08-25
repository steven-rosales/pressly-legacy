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
import type {
  ListCustomersExpectedFailure,
  ListCustomersQuery,
  ListCustomersResult,
} from './types.ts';

const querySchema = z
  .object({
    businessId: z.string(),
    query: z.string().nullable(),
    active: z.boolean().nullable(),
    limit: z.number().int(),
    cursor: z.string().nullable(),
  })
  .strict();

const failureSchema = z
  .object({
    kind: z.literal('validation'),
    code: z.enum(['user_list_invalid', 'user_cursor_invalid']),
  })
  .strict();

export const listCustomersContract = defineCellContract<
  ListCustomersQuery,
  ListCustomersResult,
  ListCustomersExpectedFailure
>({
  input: defineBoundaryContract<ListCustomersQuery>({
    version: 1,
    decode: (serialized) => {
      const parsed = querySchema.safeParse(serialized);
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(contractIssues(parsed.error.issues));
    },
    encode: (query) => ({ ...query }),
  }),
  output: defineBoundaryContract<ListCustomersResult>({
    version: 1,
    decode: (serialized) => {
      if (
        serialized === null ||
        typeof serialized !== 'object' ||
        !('items' in serialized) ||
        !Array.isArray(serialized.items) ||
        !('nextCursor' in serialized) ||
        (typeof serialized.nextCursor !== 'string' &&
          serialized.nextCursor !== null)
      )
        return decode.invalid([
          { path: [], message: 'Invalid customer list.' },
        ]);

      const items = serialized.items.map(decodeCustomerSummaryContractValue);
      const invalid = items.find((item) => item.kind === 'invalid');
      return invalid?.kind === 'invalid'
        ? invalid
        : decode.valid({
            items: items.flatMap((item) =>
              item.kind === 'valid' ? [item.value] : [],
            ),
            nextCursor: serialized.nextCursor,
          });
    },
    encode: (value) => ({
      items: value.items.map(encodeCustomerSummaryContractValue),
      nextCursor: value.nextCursor,
    }),
  }),
  failure: defineBoundaryContract<ListCustomersExpectedFailure>({
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
