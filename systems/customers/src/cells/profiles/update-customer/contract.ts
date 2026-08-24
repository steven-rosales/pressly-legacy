import {
  decode,
  defineBoundaryContract,
  defineCellContract,
} from '@pressly/cells';
import { z } from 'zod';
import {
  commandContextSchema,
  contractIssues,
  customerCommandResultSchema,
  customerProfileSchema,
  throwInvalidCustomerContractValue,
} from '../../../model/customer-contract.ts';
import type { CustomerCommandResult } from '../../../model/customer.ts';
import type {
  UpdateCustomerCommand,
  UpdateCustomerExpectedFailure,
} from './types.ts';

const changesSchema = customerProfileSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict();

const commandSchema = z
  .object({
    businessId: z.string(),
    idempotencyKey: z.string(),
    context: commandContextSchema,
    userId: z.string(),
    expectedVersion: z.number().int(),
    changes: changesSchema,
  })
  .strict();

const failureSchema = z.union([
  z
    .object({
      kind: z.literal('validation'),
      code: z.literal('user_update_invalid'),
    })
    .strict(),
  z
    .object({ kind: z.literal('not_found'), code: z.literal('user_not_found') })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      code: z.literal('user_version_conflict'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      code: z.literal('user_idempotency_conflict'),
    })
    .strict(),
]);

export const updateCustomerContract = defineCellContract<
  UpdateCustomerCommand,
  CustomerCommandResult,
  UpdateCustomerExpectedFailure
>({
  input: defineBoundaryContract<UpdateCustomerCommand>({
    version: 1,
    decode: (serialized) => {
      const parsed = commandSchema.safeParse(serialized);
      return parsed.success
        ? decode.valid({
            ...parsed.data,
            changes: Object.fromEntries(
              Object.entries(parsed.data.changes).filter(
                ([, value]) => value !== undefined,
              ),
            ),
          } as UpdateCustomerCommand)
        : decode.invalid(contractIssues(parsed.error.issues));
    },
    encode: (command) => ({ ...command, changes: { ...command.changes } }),
  }),
  output: defineBoundaryContract<CustomerCommandResult>({
    version: 1,
    decode: (serialized) => {
      const parsed = customerCommandResultSchema.safeParse(serialized);
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(contractIssues(parsed.error.issues));
    },
    encode: (value) => {
      const parsed = customerCommandResultSchema.safeParse(value);
      if (parsed.success) return parsed.data;
      return throwInvalidCustomerContractValue(
        'customer_update_result_invalid',
        'An update Customer result violated its contract.',
        parsed.error,
      );
    },
  }),
  failure: defineBoundaryContract<UpdateCustomerExpectedFailure>({
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
