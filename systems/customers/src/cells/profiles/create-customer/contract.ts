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
  CreateCustomerCommand,
  CreateCustomerExpectedFailure,
} from './types.ts';

const commandSchema = z
  .object({
    businessId: z.string(),
    idempotencyKey: z.string(),
    context: commandContextSchema,
    profile: customerProfileSchema,
  })
  .strict();

const failureSchema = z.discriminatedUnion('code', [
  z
    .object({
      kind: z.literal('validation'),
      code: z.literal('user_idempotency_key_required'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      code: z.literal('user_idempotency_conflict'),
    })
    .strict(),
]);

export const createCustomerContract = defineCellContract<
  CreateCustomerCommand,
  CustomerCommandResult,
  CreateCustomerExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const parsed = commandSchema.safeParse(serialized);
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(contractIssues(parsed.error.issues));
    },
    encode: (command) => ({ ...command, profile: { ...command.profile } }),
  }),
  output: defineBoundaryContract({
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
        'customer_create_result_invalid',
        'A create Customer result violated its contract.',
        parsed.error,
      );
    },
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
