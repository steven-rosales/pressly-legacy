import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type BoundaryContract,
  type CellContract,
  type CellOutcome,
  type ContractIssue,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import { z } from 'zod';

type UnaryOperation = (...args: never[]) => Promise<unknown>;

export type OperationInput<Operation extends UnaryOperation> =
  Parameters<Operation>[0];

export type OperationOutput<Operation extends UnaryOperation> =
  Awaited<ReturnType<Operation>> extends Result<infer Output, unknown>
    ? Output
    : Awaited<ReturnType<Operation>>;

export type OperationFailure<Operation extends UnaryOperation> =
  Awaited<ReturnType<Operation>> extends Result<unknown, infer Failure>
    ? Failure
    : never;

/**
 * Zod models an optional key as `key?: Value | undefined`, while Pressly's
 * exact-optional application types model it as `key?: Value`. JSON cannot
 * carry an explicit `undefined`, so a strict serialized schema is equivalent
 * at this boundary even though TypeScript cannot express that equivalence.
 * Keep this adapter limited to that one representational mismatch.
 */
export const exactOptionalContractSchema = <Value>(
  schema: z.ZodType,
): z.ZodType<Value> => schema as z.ZodType<Value>;

const issues = (
  values: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }));

const serializedRepresentationIssues = (
  value: unknown,
  path: readonly (string | number)[] = [],
  ancestors: ReadonlySet<object> = new Set(),
): readonly ContractIssue[] => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return [];
  if (typeof value === 'number')
    return Number.isFinite(value)
      ? []
      : [{ path, message: 'Numbers must be finite.' }];
  if (value === undefined)
    return [{ path, message: 'Undefined is not serialized data.' }];
  if (typeof value !== 'object')
    return [{ path, message: 'Expected a JSON-compatible value.' }];
  if (ancestors.has(value))
    return [{ path, message: 'Cyclic values are not serialized data.' }];

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value))
    return value.flatMap((entry, index) =>
      serializedRepresentationIssues(entry, [...path, index], nextAncestors),
    );

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null)
    return [{ path, message: 'Expected a plain serialized object.' }];

  return Object.entries(value).flatMap(([key, entry]) =>
    serializedRepresentationIssues(entry, [...path, key], nextAncestors),
  );
};

const boundary = <Value>(
  schema: z.ZodType<Value>,
  label: string,
): BoundaryContract<Value> =>
  defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const representationIssues = serializedRepresentationIssues(serialized);
      if (representationIssues.length > 0)
        return decode.invalid(representationIssues);

      const parsed = z.safeDecode(schema, serialized);
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(issues(parsed.error.issues));
    },
    encode: (value) => {
      const parsed = z.safeEncode(schema, value);
      if (parsed.success) {
        const representationIssues = serializedRepresentationIssues(
          parsed.data,
        );
        if (representationIssues.length === 0) return parsed.data;

        throw invariantViolationError({
          code: 'access_cell_contract_representation_invalid',
          message: `The ${label} value did not encode as serialized data.`,
          safeMessage: 'Access data is inconsistent.',
          details: representationIssues,
        });
      }

      throw invariantViolationError({
        code: 'access_cell_contract_encode_invalid',
        message: `The ${label} value violated its Access cell contract.`,
        safeMessage: 'Access data is inconsistent.',
        cause: parsed.error,
      });
    },
  });

export const defineAccessCellContract = <Input, Output, Failure>(input: {
  input: z.ZodType<Input>;
  output: z.ZodType<Output>;
  failure: z.ZodType<Failure>;
  label: string;
}): CellContract<Input, Output, Failure> =>
  defineCellContract({
    input: boundary(input.input, `${input.label} input`),
    output: boundary(input.output, `${input.label} output`),
    failure: boundary(input.failure, `${input.label} failure`),
  });

export const resultOperation =
  <Input, Output, Failure>(
    operation: (input: Input) => Promise<Result<Output, Failure>>,
  ): ((input: Input) => Promise<CellOutcome<Output, Failure>>) =>
  async (input) => {
    const outcome = await operation(input);
    return result.isErr(outcome)
      ? { kind: 'failure', failure: outcome.error }
      : { kind: 'success', value: outcome.value };
  };

export const successOperation =
  <Input, Output>(
    operation: (input: Input) => Promise<Output>,
  ): ((input: Input) => Promise<CellOutcome<Output, never>>) =>
  async (input) => ({ kind: 'success', value: await operation(input) });
