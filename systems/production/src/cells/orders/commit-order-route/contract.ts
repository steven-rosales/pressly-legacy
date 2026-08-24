import {
  commitProductionOrderRouteRequestSchema,
  commitProductionOrderRouteResultSchema,
  productionOrderRoutingParamsSchema,
} from '../../../read-models/production-order-control/contract.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { commitOrderRouteNotFound } from './failures.ts';
import type {
  CommitOrderRouteCommand,
  CommitOrderRouteExpectedFailure,
  CommitOrderRouteResult,
} from './types.ts';

type SerializedCommitOrderRouteInput = Readonly<{
  params: unknown;
  body: unknown;
  actorId: unknown;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const prefixedIssues = (
  prefix: string,
  issues: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  issues.map((issue) => ({
    path: [
      prefix,
      ...issue.path.map((segment) =>
        typeof segment === 'string' || typeof segment === 'number'
          ? segment
          : String(segment),
      ),
    ],
    message: issue.message,
  }));

const decodeInput = (
  serialized: unknown,
): DecodeResult<CommitOrderRouteCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The commit-order-route input must be an object.' },
    ]);

  const input: SerializedCommitOrderRouteInput = {
    params: serialized['params'],
    body: serialized['body'],
    actorId: serialized['actorId'],
  };
  // Preserve the deployed controller precedence: body before params, then
  // application identity from the authenticated response context.
  const body = commitProductionOrderRouteRequestSchema.safeParse(input.body);
  const params = productionOrderRoutingParamsSchema.safeParse(input.params);
  const actorId =
    typeof input.actorId === 'string' && input.actorId.length > 0
      ? input.actorId
      : null;
  const issues: ContractIssue[] = [
    ...(body.success ? [] : prefixedIssues('body', body.error.issues)),
    ...(params.success ? [] : prefixedIssues('params', params.error.issues)),
    ...(actorId === null
      ? [
          {
            path: ['actorId'],
            message: 'An authenticated actor ID is required.',
          } satisfies ContractIssue,
        ]
      : []),
  ];
  if (!body.success || !params.success || actorId === null)
    return decode.invalid(issues);

  const identity = {
    locationId: params.data.locationId,
    productionRunId: params.data.productionRunId,
    productionOrderId: params.data.productionOrderId,
    actorId,
    authorizedAction: 'production:stage' as const,
    expectedQueueVersion: body.data.expectedQueueVersion,
    expectedOrderVersion: body.data.expectedOrderVersion,
    expectedSourceBatchVersion: body.data.expectedSourceBatchVersion,
    proposalHash: body.data.proposalHash,
    idempotencyKey: body.data.idempotencyKey,
  };
  return body.data.kind === 'queued_move'
    ? decode.valid({
        ...identity,
        kind: body.data.kind,
        reason: body.data.reason,
        targetProductionBatchId: body.data.targetProductionBatchId,
        restartStage: body.data.restartStage,
      })
    : decode.valid({
        ...identity,
        kind: body.data.kind,
        reason: body.data.reason,
        restartStage: body.data.restartStage,
        ...(body.data.note === undefined ? {} : { note: body.data.note }),
      });
};

const encodeInput = (
  input: CommitOrderRouteCommand,
): SerializedCommitOrderRouteInput => ({
  params: {
    locationId: input.locationId,
    productionRunId: input.productionRunId,
    productionOrderId: input.productionOrderId,
  },
  body:
    input.kind === 'queued_move'
      ? {
          kind: input.kind,
          reason: input.reason,
          targetProductionBatchId: input.targetProductionBatchId,
          restartStage: input.restartStage,
          expectedQueueVersion: input.expectedQueueVersion,
          expectedOrderVersion: input.expectedOrderVersion,
          expectedSourceBatchVersion: input.expectedSourceBatchVersion,
          proposalHash: input.proposalHash,
          idempotencyKey: input.idempotencyKey,
        }
      : {
          kind: input.kind,
          reason: input.reason,
          restartStage: input.restartStage,
          ...(input.note === undefined ? {} : { note: input.note }),
          expectedQueueVersion: input.expectedQueueVersion,
          expectedOrderVersion: input.expectedOrderVersion,
          expectedSourceBatchVersion: input.expectedSourceBatchVersion,
          proposalHash: input.proposalHash,
          idempotencyKey: input.idempotencyKey,
        },
  actorId: input.actorId,
});

const decodeOutput = (
  serialized: unknown,
): DecodeResult<CommitOrderRouteResult> => {
  const parsed = commitProductionOrderRouteResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid({
        ...parsed.data,
        proposal: {
          ...parsed.data.proposal,
          releasedStages: [...parsed.data.proposal.releasedStages],
          assignedStages: [...parsed.data.proposal.assignedStages],
        },
        createdAttemptIds: [...parsed.data.createdAttemptIds],
      })
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: CommitOrderRouteResult): unknown => {
  const parsed = commitProductionOrderRouteResultSchema.safeParse({
    ...value,
    proposal: {
      ...value.proposal,
      releasedStages: [...value.proposal.releasedStages],
      assignedStages: [...value.proposal.assignedStages],
    },
    createdAttemptIds: [...value.createdAttemptIds],
  });
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

const decodeFailure = (
  serialized: unknown,
): DecodeResult<CommitOrderRouteExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    typeof serialized['code'] !== 'string' ||
    typeof serialized['message'] !== 'string' ||
    typeof serialized['safeMessage'] !== 'string'
  )
    return decode.invalid([
      { path: [], message: 'The commit-order-route failure is invalid.' },
    ]);

  if (
    serialized['kind'] === 'not_found' &&
    serialized['code'] === 'production_order_route_not_found'
  )
    return decode.valid(commitOrderRouteNotFound());

  if (serialized['kind'] === 'conflict')
    return decode.valid({
      kind: 'conflict',
      code: serialized['code'],
      message: serialized['message'],
      safeMessage: serialized['safeMessage'],
    });

  if (
    serialized['kind'] === 'validation' &&
    serialized['classification'] === 'semantic'
  )
    return decode.valid({
      kind: 'validation',
      classification: 'semantic',
      code: serialized['code'],
      message: serialized['message'],
      safeMessage: serialized['safeMessage'],
    });

  return decode.invalid([
    { path: [], message: 'The commit-order-route failure is invalid.' },
  ]);
};

export const commitOrderRouteContract = defineCellContract<
  CommitOrderRouteCommand,
  CommitOrderRouteResult,
  CommitOrderRouteExpectedFailure
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
    encode: (failure) => ({ ...failure }),
  }),
});
