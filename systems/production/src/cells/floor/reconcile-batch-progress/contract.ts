import {
  productionBatchProgressReconciliationParamsSchema,
  productionBatchProgressReconciliationResultSchema,
  reconcileProductionBatchProgressRequestSchema,
} from './boundary.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  ReconcileBatchProgressCommand,
  ReconcileBatchProgressExpectedFailure,
  ReconcileBatchProgressResult,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
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
  value: unknown,
): DecodeResult<ReconcileBatchProgressCommand> => {
  if (!isRecord(value))
    return decode.invalid([
      { path: [], message: 'Reconciliation input must be an object.' },
    ]);
  const body = reconcileProductionBatchProgressRequestSchema.safeParse(
    value['body'],
  );
  const params = productionBatchProgressReconciliationParamsSchema.safeParse(
    value['params'],
  );
  const actorId = value['actorId'];
  const failures: ContractIssue[] = [
    ...(body.success ? [] : issues('body', body.error.issues)),
    ...(params.success ? [] : issues('params', params.error.issues)),
    ...(typeof actorId === 'string' && actorId.length > 0
      ? []
      : [
          {
            path: ['actorId'],
            message: 'An authenticated actor ID is required.',
          },
        ]),
  ];
  if (
    !body.success ||
    !params.success ||
    typeof actorId !== 'string' ||
    actorId.length === 0
  )
    return decode.invalid(failures);
  return decode.valid({
    locationId: params.data.locationId,
    productionRunId: params.data.productionRunId,
    productionBatchId: params.data.productionBatchId,
    expectedQueueVersion: body.data.expectedQueueVersion,
    expectedBatchVersion: body.data.expectedBatchVersion,
    expectedStageVersions: body.data.expectedStageVersions.map((stage) => ({
      ...stage,
    })),
    target: body.data.target,
    reason: body.data.reason,
    note: body.data.note ?? null,
    machineIds: [...body.data.machineIds],
    confirmation:
      body.data.confirmation === undefined
        ? null
        : { ...body.data.confirmation },
    idempotencyKey: body.data.idempotencyKey,
    actorId,
  });
};

const decodeFailure = (
  value: unknown,
): DecodeResult<ReconcileBatchProgressExpectedFailure> =>
  isRecord(value) &&
  (value['kind'] === 'conflict' || value['kind'] === 'not_found') &&
  typeof value['code'] === 'string' &&
  typeof value['message'] === 'string' &&
  typeof value['safeMessage'] === 'string'
    ? decode.valid({
        kind: value['kind'],
        code: value['code'],
        message: value['message'],
        safeMessage: value['safeMessage'],
      })
    : decode.invalid([
        { path: [], message: 'Reconciliation failure is invalid.' },
      ]);

const encodeOutput = (value: ReconcileBatchProgressResult): unknown => {
  const parsed =
    productionBatchProgressReconciliationResultSchema.safeParse(value);
  if (!parsed.success)
    throw invariantViolationError({
      code: 'invalid_api_success_response',
      message:
        'An application success result did not satisfy its serialized response contract.',
      safeMessage: 'The request could not be completed.',
      cause: parsed.error,
    });
  return parsed.data;
};

export const reconcileBatchProgressContract = defineCellContract<
  ReconcileBatchProgressCommand,
  ReconcileBatchProgressResult,
  ReconcileBatchProgressExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: {
        locationId: input.locationId,
        productionRunId: input.productionRunId,
        productionBatchId: input.productionBatchId,
      },
      body: {
        expectedQueueVersion: input.expectedQueueVersion,
        expectedBatchVersion: input.expectedBatchVersion,
        expectedStageVersions: input.expectedStageVersions.map((stage) => ({
          ...stage,
        })),
        target: input.target,
        reason: input.reason,
        ...(input.note === null ? {} : { note: input.note }),
        machineIds: [...input.machineIds],
        ...(input.confirmation === null
          ? {}
          : { confirmation: { ...input.confirmation } }),
        idempotencyKey: input.idempotencyKey,
      },
      actorId: input.actorId,
    }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (value) => {
      const parsed =
        productionBatchProgressReconciliationResultSchema.safeParse(value);
      return parsed.success
        ? decode.valid(parsed.data as ReconcileBatchProgressResult)
        : decode.invalid(issues('output', parsed.error.issues));
    },
    encode: encodeOutput,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: decodeFailure,
    encode: (failure) => ({ ...failure }),
  }),
});
