import {
  confirmProductionOrderOvertimeRequestSchema,
  confirmProductionOrderOvertimeResultSchema,
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
import { isConfirmOrderOvertimeExpectedFailure } from './failures.ts';
import type {
  ConfirmOrderOvertimeExpectedFailure,
  ConfirmProductionOrderOvertimeCommand,
  ConfirmProductionOrderOvertimeResult,
} from './types.ts';

export const confirmOrderOvertimeParamsSchema = productionRunParamsSchema
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
): DecodeResult<ConfirmProductionOrderOvertimeCommand> => {
  if (!isRecord(value))
    return decode.invalid([
      { path: [], message: 'Overtime-confirmation input must be an object.' },
    ]);
  const body = confirmProductionOrderOvertimeRequestSchema.safeParse(
    value['body'],
  );
  const params = confirmOrderOvertimeParamsSchema.safeParse(value['params']);
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
    proposalHash: body.data.proposalHash,
    idempotencyKey: body.data.idempotencyKey,
    actorId,
    authorizedAction: 'production:override',
  });
};

const decodeOutput = (
  value: unknown,
): DecodeResult<ConfirmProductionOrderOvertimeResult> => {
  const parsed = confirmProductionOrderOvertimeResultSchema.safeParse(value);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: ConfirmProductionOrderOvertimeResult): unknown => {
  const parsed = confirmProductionOrderOvertimeResultSchema.safeParse(value);
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

export const confirmOrderOvertimeContract = defineCellContract<
  ConfirmProductionOrderOvertimeCommand,
  ConfirmProductionOrderOvertimeResult,
  ConfirmOrderOvertimeExpectedFailure
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
        proposalHash: input.proposalHash,
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
      isConfirmOrderOvertimeExpectedFailure(value)
        ? decode.valid(value)
        : decode.invalid([
            { path: [], message: 'Overtime-confirmation failure is invalid.' },
          ]),
    encode: (failure) => ({ ...failure }),
  }),
});
