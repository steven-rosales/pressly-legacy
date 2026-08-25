import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import {
  commitProductionOrderBacklogRequestSchema,
  productionOrderBacklogCommitResultSchema,
} from '../../../read-models/production-order-backlog/contract.ts';
import { productionLocationParamsSchema } from './boundary.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type { ProductionOrderBacklogCursorFailure } from '../../../read-models/production-order-backlog/model.ts';
import type {
  CommitOrderBacklogCommand,
  CommitOrderBacklogExpectedFailure,
  CommitOrderBacklogResult,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const issues = (
  prefix: 'body' | 'params' | 'output',
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
): DecodeResult<CommitOrderBacklogCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      {
        path: [],
        message: 'The commit-order-backlog input must be an object.',
      },
    ]);
  // Preserve deployed validation precedence: body before route params.
  const body = commitProductionOrderBacklogRequestSchema.safeParse(
    serialized['body'],
  );
  const params = productionLocationParamsSchema.safeParse(serialized['params']);
  const actorId = serialized['actorId'];
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
    actorId,
    filter: body.data.filter,
    cutoff: body.data.cutoff,
    reason: body.data.reason,
    cursor: body.data.cursor,
    maxOrders: body.data.maxOrders,
    note: body.data.note,
    previewHash: body.data.previewHash,
    idempotencyKey: body.data.idempotencyKey,
  });
};

const encodeInput = (input: CommitOrderBacklogCommand): unknown => ({
  body: {
    filter: input.filter,
    cutoff: input.cutoff,
    reason: input.reason,
    cursor: input.cursor,
    maxOrders: input.maxOrders,
    note: input.note,
    previewHash: input.previewHash,
    idempotencyKey: input.idempotencyKey,
  },
  params: { locationId: input.locationId },
  actorId: input.actorId,
});

const decodeOutput = (
  serialized: unknown,
): DecodeResult<CommitOrderBacklogResult> => {
  const parsed = productionOrderBacklogCommitResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues('output', parsed.error.issues));
};

const encodeOutput = (value: CommitOrderBacklogResult): unknown => {
  const parsed = productionOrderBacklogCommitResultSchema.safeParse(value);
  if (!parsed.success)
    throw invariantViolationError({
      code: 'invalid_cell_success_response',
      message:
        'A commit-order-backlog success result did not satisfy its serialized contract.',
      safeMessage: 'The production order backlog commit result is invalid.',
      cause: parsed.error,
    });
  return parsed.data;
};

const isCursorReason = (
  value: unknown,
): value is ProductionOrderBacklogCursorFailure['code'] =>
  value === 'production_order_backlog_cursor_invalid' ||
  value === 'production_order_backlog_cursor_scope_mismatch';

const conflictCodes = new Set([
  'production_idempotency_conflict',
  'production_order_backlog_preview_stale',
  'production_order_backlog_commit_conflict',
]);

const decodeFailure = (
  serialized: unknown,
): DecodeResult<CommitOrderBacklogExpectedFailure> => {
  if (!isRecord(serialized) || serialized['tag'] !== 'ProductionFailure')
    return decode.invalid([
      { path: [], message: 'The commit-order-backlog failure is invalid.' },
    ]);
  if (
    serialized['kind'] === 'validation' &&
    serialized['classification'] === 'malformed' &&
    serialized['code'] === 'production_order_backlog_cursor_invalid' &&
    typeof serialized['message'] === 'string' &&
    serialized['safeMessage'] === serialized['message'] &&
    isRecord(serialized['details']) &&
    isCursorReason(serialized['details']['reason'])
  )
    return decode.valid({
      tag: 'ProductionFailure',
      kind: 'validation',
      classification: 'malformed',
      code: 'production_order_backlog_cursor_invalid',
      message: serialized['message'],
      safeMessage: serialized['message'],
      details: { reason: serialized['details']['reason'] },
    });
  if (
    serialized['kind'] === 'conflict' &&
    typeof serialized['code'] === 'string' &&
    conflictCodes.has(serialized['code']) &&
    typeof serialized['message'] === 'string' &&
    typeof serialized['safeMessage'] === 'string'
  )
    return decode.valid({
      tag: 'ProductionFailure',
      kind: 'conflict',
      code: serialized['code'] as
        | 'production_idempotency_conflict'
        | 'production_order_backlog_preview_stale'
        | 'production_order_backlog_commit_conflict',
      message: serialized['message'],
      safeMessage: serialized['safeMessage'],
    });
  return decode.invalid([
    { path: [], message: 'The commit-order-backlog failure is invalid.' },
  ]);
};

export const commitOrderBacklogContract = defineCellContract<
  CommitOrderBacklogCommand,
  CommitOrderBacklogResult,
  CommitOrderBacklogExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: encodeInput,
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeOutput,
    encode: encodeOutput,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: decodeFailure,
    encode: (failure) =>
      failure.kind === 'validation'
        ? { ...failure, details: { ...failure.details } }
        : { ...failure },
  }),
});
