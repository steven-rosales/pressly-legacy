import {
  exactProductionOrderPlacementResultSchema,
  placeProductionOrderExactlyRequestSchema,
  productionRunParamsSchema,
} from '../../../read-models/production-order-placement/contract.ts';
import { productionIdSchema } from '../../../read-models/production-order/contract.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { placeOrderExactlyNotFound } from './failures.ts';
import type {
  PlaceOrderExactlyCommand,
  PlaceOrderExactlyExpectedFailure,
  PlaceOrderExactlyResult,
} from './types.ts';

export const placeOrderExactlyParamsSchema = productionRunParamsSchema
  .extend({
    productionBatchId: productionIdSchema,
    productionOrderId: productionIdSchema,
  })
  .strict();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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
): DecodeResult<PlaceOrderExactlyCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The place-order-exactly input must be an object.' },
    ]);

  const body = placeProductionOrderExactlyRequestSchema.safeParse(
    serialized['body'],
  );
  const params = placeOrderExactlyParamsSchema.safeParse(serialized['params']);
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
    productionRunId: params.data.productionRunId,
    productionBatchId: params.data.productionBatchId,
    productionOrderId: params.data.productionOrderId,
    expectedQueueVersion: body.data.expectedQueueVersion,
    expectedBatchVersion: body.data.expectedBatchVersion,
    idempotencyKey: body.data.idempotencyKey,
    actorId,
    authorizedAction: 'production:override',
  });
};

const encodeInput = (input: PlaceOrderExactlyCommand): unknown => ({
  body: {
    expectedQueueVersion: input.expectedQueueVersion,
    expectedBatchVersion: input.expectedBatchVersion,
    idempotencyKey: input.idempotencyKey,
  },
  params: {
    locationId: input.locationId,
    productionRunId: input.productionRunId,
    productionBatchId: input.productionBatchId,
    productionOrderId: input.productionOrderId,
  },
  actorId: input.actorId,
});

const materializeResult = (
  result: PlaceOrderExactlyResult,
): PlaceOrderExactlyResult => {
  switch (result.status) {
    case 'placed':
      return { ...result, affectedBatchIds: [...result.affectedBatchIds] };
    case 'confirmation_required':
      return {
        ...result,
        target: { ...result.target },
        affectedBatchIds: [...result.affectedBatchIds],
      };
    case 'not_placed':
      return { ...result };
  }
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<PlaceOrderExactlyResult> => {
  const parsed =
    exactProductionOrderPlacementResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(materializeResult(parsed.data))
    : decode.invalid(issues('output', parsed.error.issues));
};

const encodeOutput = (result: PlaceOrderExactlyResult): unknown => {
  const parsed = exactProductionOrderPlacementResultSchema.safeParse(
    materializeResult(result),
  );
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
): DecodeResult<PlaceOrderExactlyExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    typeof serialized['code'] !== 'string' ||
    typeof serialized['message'] !== 'string' ||
    typeof serialized['safeMessage'] !== 'string'
  )
    return decode.invalid([
      { path: [], message: 'The place-order-exactly failure is invalid.' },
    ]);
  if (
    serialized['kind'] === 'not_found' &&
    serialized['code'] === 'production_placement_context_not_found'
  )
    return decode.valid(placeOrderExactlyNotFound());
  if (serialized['kind'] === 'conflict')
    return decode.valid({
      kind: 'conflict',
      code: serialized['code'],
      message: serialized['message'],
      safeMessage: serialized['safeMessage'],
    });
  return decode.invalid([
    { path: [], message: 'The place-order-exactly failure is invalid.' },
  ]);
};

export const placeOrderExactlyContract = defineCellContract<
  PlaceOrderExactlyCommand,
  PlaceOrderExactlyResult,
  PlaceOrderExactlyExpectedFailure
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
