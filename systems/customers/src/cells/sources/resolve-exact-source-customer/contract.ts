import { jsonValueSchema } from '@pressly/codec/zod';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
} from '@pressly/cells';
import { z } from 'zod';
import {
  commandContextSchema,
  contractIssues,
  customerProfileSchema,
  encodeCustomerTimestamp,
  throwInvalidCustomerContractValue,
} from '../../../model/customer-contract.ts';
import type {
  ResolveExactSourceCustomerCommand,
  ResolveExactSourceCustomerExpectedFailure,
  ResolveExactSourceCustomerResult,
} from './types.ts';

const commandSchema = z
  .object({
    businessId: z.string(),
    source: z.string(),
    externalUserId: z.string(),
    profile: customerProfileSchema,
    revision: z
      .object({
        at: z.iso.datetime(),
        hash: z.string(),
        adapterVersion: z.string(),
        observedAt: z.iso.datetime(),
        normalizedPayload: jsonValueSchema,
      })
      .strict(),
    idempotencyKey: z.string(),
    context: commandContextSchema,
    now: z.iso.datetime(),
  })
  .strict();

const resultSchema = z
  .object({
    customer: z
      .object({
        customerId: z.string(),
        businessId: z.string(),
        version: z.number().int().positive(),
        active: z.boolean(),
        profile: customerProfileSchema,
      })
      .strict(),
    created: z.boolean(),
  })
  .strict();

const failureSchema = z.union([
  z
    .object({
      kind: z.literal('conflict'),
      code: z.literal('canonical_source_user_business_conflict'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      code: z.literal('user_idempotency_conflict'),
    })
    .strict(),
]);

export const resolveExactSourceCustomerContract = defineCellContract<
  ResolveExactSourceCustomerCommand,
  ResolveExactSourceCustomerResult,
  ResolveExactSourceCustomerExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const parsed = commandSchema.safeParse(serialized);
      return parsed.success
        ? decode.valid({
            ...parsed.data,
            revision: {
              ...parsed.data.revision,
              at: new Date(parsed.data.revision.at),
              observedAt: new Date(parsed.data.revision.observedAt),
            },
            now: new Date(parsed.data.now),
          })
        : decode.invalid(contractIssues(parsed.error.issues));
    },
    encode: (command) => ({
      ...command,
      profile: { ...command.profile },
      revision: {
        ...command.revision,
        at: encodeCustomerTimestamp(
          command.revision.at,
          'customer_source_revision_timestamp_invalid',
        ),
        observedAt: encodeCustomerTimestamp(
          command.revision.observedAt,
          'customer_source_observed_timestamp_invalid',
        ),
      },
      now: encodeCustomerTimestamp(
        command.now,
        'customer_source_resolution_timestamp_invalid',
      ),
    }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const parsed = resultSchema.safeParse(serialized);
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(contractIssues(parsed.error.issues));
    },
    encode: (value) => {
      const parsed = resultSchema.safeParse(value);
      if (parsed.success) return parsed.data;
      return throwInvalidCustomerContractValue(
        'customer_source_resolution_result_invalid',
        'A Customer source-resolution result violated its contract.',
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
