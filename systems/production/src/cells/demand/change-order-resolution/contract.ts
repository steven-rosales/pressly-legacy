import {
  changeProductionOrderResolutionRequestSchema,
  changeProductionOrderResolutionResultSchema,
  productionOrderParamsSchema,
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
  ChangeOrderResolutionCommand,
  ChangeOrderResolutionExpectedFailure,
  ChangeOrderResolutionResult,
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

const sourceStatePrecondition = (
  value: unknown,
): DecodeResult<
  | Readonly<{ commercialState: 'open'; admissionState: 'unreleased' }>
  | undefined
> => {
  if (value === undefined) return decode.valid(undefined);
  if (
    isRecord(value) &&
    value['commercialState'] === 'open' &&
    value['admissionState'] === 'unreleased' &&
    Object.keys(value).length === 2
  )
    return decode.valid({
      commercialState: 'open',
      admissionState: 'unreleased',
    });
  return decode.invalid([
    {
      path: ['sourceStatePrecondition'],
      message: 'The source-state precondition is invalid.',
    },
  ]);
};

const decodeInput = (
  serialized: unknown,
): DecodeResult<ChangeOrderResolutionCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      {
        path: [],
        message: 'The change-order-resolution input must be an object.',
      },
    ]);
  const body = changeProductionOrderResolutionRequestSchema.safeParse(
    serialized['body'],
  );
  const params = productionOrderParamsSchema.safeParse(serialized['params']);
  const precondition = sourceStatePrecondition(
    serialized['sourceStatePrecondition'],
  );
  const actorId = serialized['actorId'];
  const failures: ContractIssue[] = [
    ...(body.success ? [] : issues('body', body.error.issues)),
    ...(params.success ? [] : issues('params', params.error.issues)),
    ...(precondition.kind === 'valid' ? [] : precondition.issues),
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
    precondition.kind === 'invalid' ||
    typeof actorId !== 'string' ||
    actorId.length === 0
  )
    return decode.invalid(failures);

  const scope = {
    locationId: params.data.locationId,
    productionOrderId: params.data.productionOrderId,
    actorId,
    expectedVersion: body.data.expectedVersion,
    idempotencyKey: body.data.idempotencyKey,
    ...(precondition.value === undefined
      ? {}
      : { sourceStatePrecondition: precondition.value }),
  };
  return body.data.action === 'resolve_without_production'
    ? decode.valid({
        ...scope,
        action: body.data.action,
        reason: body.data.reason,
        note: body.data.note,
        confirmReviewedFacts: body.data.confirmReviewedFacts,
      })
    : decode.valid({
        ...scope,
        action: body.data.action,
        reason: body.data.reason,
        note: body.data.note,
      });
};

const encodeInput = (input: ChangeOrderResolutionCommand): unknown => ({
  body:
    input.action === 'resolve_without_production'
      ? {
          action: input.action,
          reason: input.reason,
          note: input.note,
          confirmReviewedFacts: input.confirmReviewedFacts,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
        }
      : {
          action: input.action,
          reason: input.reason,
          note: input.note,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
        },
  params: {
    locationId: input.locationId,
    productionOrderId: input.productionOrderId,
  },
  actorId: input.actorId,
  ...(input.sourceStatePrecondition === undefined
    ? {}
    : { sourceStatePrecondition: input.sourceStatePrecondition }),
});

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ChangeOrderResolutionResult> => {
  const parsed =
    changeProductionOrderResolutionResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues('output', parsed.error.issues));
};

const encodeOutput = (value: ChangeOrderResolutionResult): unknown => {
  const parsed = changeProductionOrderResolutionResultSchema.safeParse(value);
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
): DecodeResult<ChangeOrderResolutionExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    (serialized['kind'] !== 'not_found' && serialized['kind'] !== 'conflict') ||
    typeof serialized['code'] !== 'string' ||
    typeof serialized['message'] !== 'string' ||
    typeof serialized['safeMessage'] !== 'string'
  )
    return decode.invalid([
      { path: [], message: 'The change-order-resolution failure is invalid.' },
    ]);
  return decode.valid({
    kind: serialized['kind'],
    code: serialized['code'],
    message: serialized['message'],
    safeMessage: serialized['safeMessage'],
  });
};

export const changeOrderResolutionContract = defineCellContract<
  ChangeOrderResolutionCommand,
  ChangeOrderResolutionResult,
  ChangeOrderResolutionExpectedFailure
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
