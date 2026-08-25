import {
  decode,
  defineBoundaryContract,
  type BoundaryContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { z } from 'zod';

export const ingressBoundaryIssues = (
  values: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: issue.path.map((part) =>
      typeof part === 'string' || typeof part === 'number'
        ? part
        : String(part),
    ),
    message: issue.message,
  }));

export const decodeIngressBoundary = <Value>(
  schema: z.ZodType<Value>,
  serialized: unknown,
): DecodeResult<Value> => {
  const parsed = schema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(ingressBoundaryIssues(parsed.error.issues));
};

export const encodeIngressBoundary = <Value>(
  schema: z.ZodType<Value>,
  value: unknown,
  input: Readonly<{
    code: string;
    message: string;
  }>,
): Value => {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw invariantViolationError({
    code: input.code,
    message: input.message,
    safeMessage: 'Ingress data is inconsistent.',
    cause: parsed.error,
  });
};

export const noExpectedFailureBoundary = (
  operation: string,
): BoundaryContract<never> =>
  defineBoundaryContract({
    version: 1,
    decode: () =>
      decode.invalid([
        { path: [], message: `${operation} has no expected failure.` },
      ]),
    encode: (failure) => failure,
  });

export const utcIsoSchema = z.string().datetime({ offset: true });

export const utcDateSchema = utcIsoSchema.transform((value) => new Date(value));

export const nullableUtcDateSchema = utcDateSchema.nullable();

export const serializeDate = (value: Date, code: string): string => {
  if (Number.isFinite(value.getTime())) return value.toISOString();
  throw invariantViolationError({
    code,
    message: 'An Ingress timestamp is invalid.',
    safeMessage: 'Ingress data is inconsistent.',
  });
};
