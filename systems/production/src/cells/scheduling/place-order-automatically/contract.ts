import {
  automaticProductionOrderPlacementResultSchema,
  placeProductionOrderAutomaticallyRequestSchema,
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
import { isPlaceOrderAutomaticallyExpectedFailure } from './failures.ts';
import type {
  AutomaticProductionOrderPlacementResult,
  PlaceOrderAutomaticallyExpectedFailure,
  PlaceProductionOrderAutomaticallyCommand,
} from './types.ts';

export const placeOrderAutomaticallyParamsSchema = productionRunParamsSchema
  .extend({ productionOrderId: productionIdSchema })
  .strict();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const prefixedIssues = (
  prefix: string,
  issues: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)],
    message: issue.message,
  }));

const decodeInput = (
  value: unknown,
): DecodeResult<PlaceProductionOrderAutomaticallyCommand> => {
  if (!isRecord(value))
    return decode.invalid([
      { path: [], message: 'Automatic-placement input must be an object.' },
    ]);

  const body = placeProductionOrderAutomaticallyRequestSchema.safeParse(
    value['body'],
  );
  const params = placeOrderAutomaticallyParamsSchema.safeParse(value['params']);
  const actorId = value['actorId'];
  const issues: ContractIssue[] = [
    ...(body.success ? [] : prefixedIssues('body', body.error.issues)),
    ...(params.success ? [] : prefixedIssues('params', params.error.issues)),
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
    return decode.invalid(issues);

  return decode.valid({
    locationId: params.data.locationId,
    productionRunId: params.data.productionRunId,
    productionOrderId: params.data.productionOrderId,
    expectedQueueVersion: body.data.expectedQueueVersion,
    idempotencyKey: body.data.idempotencyKey,
    actorId,
    authorizedAction: 'production:override',
  });
};

const decodeOutput = (
  value: unknown,
): DecodeResult<AutomaticProductionOrderPlacementResult> => {
  const parsed = automaticProductionOrderPlacementResultSchema.safeParse(value);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (
  value: AutomaticProductionOrderPlacementResult,
): unknown => {
  const parsed = automaticProductionOrderPlacementResultSchema.safeParse(value);
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

export const placeOrderAutomaticallyContract = defineCellContract<
  PlaceProductionOrderAutomaticallyCommand,
  AutomaticProductionOrderPlacementResult,
  PlaceOrderAutomaticallyExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: {
        locationId: input.locationId,
        productionRunId: input.productionRunId,
        productionOrderId: input.productionOrderId,
      },
      body: {
        expectedQueueVersion: input.expectedQueueVersion,
        idempotencyKey: input.idempotencyKey,
      },
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
    decode: (value) =>
      isPlaceOrderAutomaticallyExpectedFailure(value)
        ? decode.valid(value)
        : decode.invalid([
            {
              path: [],
              message: 'Automatic-placement failure is invalid.',
            },
          ]),
    encode: (failure) => ({ ...failure }),
  }),
});
