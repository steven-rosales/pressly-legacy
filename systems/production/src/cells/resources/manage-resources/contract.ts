import {
  productionBootstrapInputSchema,
  productionBootstrapResultSchema,
} from './boundary.ts';
import { productionIdSchema } from '../../../read-models/production-order/contract.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  ManageResourcesCommand,
  ManageResourcesExpectedFailure,
  ManageResourcesResult,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const issues = (
  prefix: string,
  values: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: [prefix, ...issue.path.map(String)],
    message: issue.message,
  }));

const decodeInput = (
  serialized: unknown,
): DecodeResult<ManageResourcesCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The manage-resources input must be an object.' },
    ]);
  const allowedFields = new Set([
    'manifest',
    'dryRun',
    'idempotencyKey',
    'actorId',
  ]);
  const unexpectedFields = Object.keys(serialized).filter(
    (field) => !allowedFields.has(field),
  );
  const parsed = productionBootstrapInputSchema.safeParse({
    manifest: serialized['manifest'],
    dryRun: serialized['dryRun'],
    idempotencyKey: serialized['idempotencyKey'],
  });
  const actor = productionIdSchema.safeParse(serialized['actorId']);
  const failures: ContractIssue[] = [
    ...(parsed.success ? [] : issues('input', parsed.error.issues)),
    ...(actor.success ? [] : issues('actorId', actor.error.issues)),
    ...unexpectedFields.map((field) => ({
      path: [field],
      message: 'Unrecognized input field.',
    })),
  ];
  if (!parsed.success || !actor.success || unexpectedFields.length > 0)
    return decode.invalid(failures);
  return decode.valid({ ...parsed.data, actorId: actor.data });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ManageResourcesResult> => {
  const parsed = productionBootstrapResultSchema.safeParse(serialized);
  if (!parsed.success)
    return decode.invalid(issues('output', parsed.error.issues));
  if (parsed.data.status === 'converged')
    return decode.valid({ ...parsed.data, rejections: [] });

  const [firstRejection, ...remainingRejections] = parsed.data.rejections;
  return firstRejection === undefined
    ? decode.invalid([
        {
          path: ['output', 'rejections'],
          message: 'A rejected bootstrap result requires one rejection.',
        },
      ])
    : decode.valid({
        ...parsed.data,
        rejections: [firstRejection, ...remainingRejections],
      });
};

const encodeOutput = (value: ManageResourcesResult): unknown => {
  const parsed = productionBootstrapResultSchema.safeParse(value);
  if (!parsed.success)
    throw invariantViolationError({
      code: 'invalid_cell_success_response',
      message:
        'A manage-resources success result did not satisfy its serialized contract.',
      safeMessage: 'The production bootstrap result is invalid.',
      cause: parsed.error,
    });
  return parsed.data;
};

const decodeFailure = (
  serialized: unknown,
): DecodeResult<ManageResourcesExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    typeof serialized['message'] !== 'string' ||
    typeof serialized['safeMessage'] !== 'string'
  )
    return decode.invalid([
      { path: [], message: 'The manage-resources failure is invalid.' },
    ]);
  if (
    serialized['kind'] === 'validation' &&
    serialized['classification'] === 'malformed' &&
    serialized['code'] === 'production_bootstrap_machine_station_missing'
  )
    return decode.valid({
      kind: 'validation',
      classification: 'malformed',
      code: 'production_bootstrap_machine_station_missing',
      message: serialized['message'],
      safeMessage: serialized['safeMessage'],
    });
  if (
    serialized['kind'] === 'conflict' &&
    serialized['code'] === 'production_idempotency_conflict'
  )
    return decode.valid({
      kind: 'conflict',
      code: 'production_idempotency_conflict',
      message: serialized['message'],
      safeMessage: serialized['safeMessage'],
    });
  return decode.invalid([
    { path: [], message: 'The manage-resources failure is invalid.' },
  ]);
};

export const manageResourcesContract = defineCellContract<
  ManageResourcesCommand,
  ManageResourcesResult,
  ManageResourcesExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      manifest: input.manifest,
      dryRun: input.dryRun,
      idempotencyKey: input.idempotencyKey,
      actorId: input.actorId,
    }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeOutput,
    encode: encodeOutput,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: decodeFailure,
    encode: (failure) => ({ ...failure }),
  }),
});
