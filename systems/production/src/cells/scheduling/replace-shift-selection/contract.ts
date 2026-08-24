import {
  productionShiftParamsSchema,
  replaceProductionShiftSelectionRequestSchema,
  replaceProductionShiftSelectionResultSchema,
} from './boundary.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { canonicalizeSelectedOrderIds } from './decide.ts';
import {
  replaceShiftSelectionAlreadyStarted,
  replaceShiftSelectionIdempotencyConflict,
  replaceShiftSelectionNotFound,
  replaceShiftSelectionNotReady,
  replaceShiftSelectionPlanStateInvalid,
  replaceShiftSelectionScheduleVersionConflict,
  replaceShiftSelectionVersionConflict,
} from './failures.ts';
import type {
  ReplaceShiftSelectionCommand,
  ReplaceShiftSelectionExpectedFailure,
  ReplaceShiftSelectionResult,
} from './types.ts';

type SerializedReplaceShiftSelectionInput = Readonly<{
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
): DecodeResult<ReplaceShiftSelectionCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      {
        path: [],
        message: 'The replace-shift-selection input must be an object.',
      },
    ]);

  const input: SerializedReplaceShiftSelectionInput = {
    params: serialized['params'],
    body: serialized['body'],
    actorId: serialized['actorId'],
  };
  const body = replaceProductionShiftSelectionRequestSchema.safeParse(
    input.body,
  );
  const params = productionShiftParamsSchema.safeParse(input.params);
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
          },
        ]
      : []),
  ];
  if (!body.success || !params.success || actorId === null)
    return decode.invalid(issues);

  return decode.valid({
    locationId: params.data.locationId,
    productionShiftId: params.data.productionShiftId,
    actorId,
    selectedOrderIds: canonicalizeSelectedOrderIds(body.data.selectedOrderIds),
    expectedVersion: body.data.expectedVersion,
    idempotencyKey: body.data.idempotencyKey,
  });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ReplaceShiftSelectionResult> => {
  const parsed =
    replaceProductionShiftSelectionResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: ReplaceShiftSelectionResult): unknown => {
  const parsed = replaceProductionShiftSelectionResultSchema.safeParse(value);
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

const exactFailures = (): readonly ReplaceShiftSelectionExpectedFailure[] => [
  replaceShiftSelectionIdempotencyConflict(),
  replaceShiftSelectionNotFound(),
  replaceShiftSelectionAlreadyStarted(),
  replaceShiftSelectionVersionConflict(),
  replaceShiftSelectionNotReady(),
  replaceShiftSelectionPlanStateInvalid(),
  replaceShiftSelectionScheduleVersionConflict(),
];

const decodeFailure = (
  serialized: unknown,
): DecodeResult<ReplaceShiftSelectionExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    typeof serialized['kind'] !== 'string' ||
    typeof serialized['code'] !== 'string' ||
    typeof serialized['message'] !== 'string' ||
    typeof serialized['safeMessage'] !== 'string'
  )
    return decode.invalid([
      { path: [], message: 'The replace-shift-selection failure is invalid.' },
    ]);

  const matching = exactFailures().find(
    (failure) =>
      failure.kind === serialized['kind'] &&
      failure.code === serialized['code'] &&
      failure.message === serialized['message'] &&
      failure.safeMessage === serialized['safeMessage'],
  );
  return matching === undefined
    ? decode.invalid([
        {
          path: [],
          message: 'The replace-shift-selection failure is invalid.',
        },
      ])
    : decode.valid(matching);
};

export const replaceShiftSelectionContract = defineCellContract<
  ReplaceShiftSelectionCommand,
  ReplaceShiftSelectionResult,
  ReplaceShiftSelectionExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: {
        locationId: input.locationId,
        productionShiftId: input.productionShiftId,
      },
      body: {
        selectedOrderIds: canonicalizeSelectedOrderIds(input.selectedOrderIds),
        expectedVersion: input.expectedVersion,
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
    decode: decodeFailure,
    encode: (failure) => ({ ...failure }),
  }),
});
