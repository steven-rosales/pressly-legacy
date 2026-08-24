import { decode, type ContractIssue } from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { z } from 'zod';
import type { CustomerSummary } from './customer.ts';

export const commandContextSchema = z
  .object({
    origin: z.string(),
    principal: z
      .object({
        kind: z.enum(['human', 'service', 'system']),
        id: z.string(),
      })
      .strict(),
  })
  .strict();

export const customerProfileSchema = z
  .object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    businessName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  })
  .strict();

export const customerCommandResultSchema = z
  .object({
    userId: z.string(),
    version: z.number().int(),
    replayed: z.boolean(),
  })
  .strict();

const customerSummarySchema = z
  .object({
    id: z.string(),
    businessId: z.string(),
    version: z.number().int(),
    active: z.boolean(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    businessName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    displayName: z.string(),
    possibleDuplicateCount: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const contractIssues = (
  values: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }));

export const throwInvalidCustomerContractValue = (
  code: string,
  message: string,
  cause?: unknown,
): never => {
  throw invariantViolationError({
    code,
    message,
    safeMessage: 'Customer data is inconsistent.',
    ...(cause === undefined ? {} : { cause }),
  });
};

export const encodeCustomerTimestamp = (value: Date, code: string): string => {
  if (Number.isFinite(value.getTime())) return value.toISOString();
  return throwInvalidCustomerContractValue(
    code,
    'A Customer timestamp is invalid.',
  );
};

export const decodeCustomerSummaryContractValue = (serialized: unknown) => {
  const parsed = customerSummarySchema.safeParse(serialized);
  return parsed.success
    ? decode.valid<CustomerSummary>({
        ...parsed.data,
        createdAt: new Date(parsed.data.createdAt),
        updatedAt: new Date(parsed.data.updatedAt),
      })
    : decode.invalid(contractIssues(parsed.error.issues));
};

export const encodeCustomerSummaryContractValue = (
  summary: CustomerSummary,
): unknown => {
  const serialized = {
    ...summary,
    createdAt: encodeCustomerTimestamp(
      summary.createdAt,
      'customer_summary_created_timestamp_invalid',
    ),
    updatedAt: encodeCustomerTimestamp(
      summary.updatedAt,
      'customer_summary_updated_timestamp_invalid',
    ),
  };
  const parsed = customerSummarySchema.safeParse(serialized);
  if (parsed.success) return parsed.data;
  return throwInvalidCustomerContractValue(
    'customer_summary_invalid',
    'A Customer summary violated its contract.',
    parsed.error,
  );
};
