import { automaticProductionOrderPlacementResultSchema } from '../../../read-models/production-order-placement/contract.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  AttemptAutomaticPlacementCommand,
  AttemptAutomaticPlacementExpectedFailure,
  AttemptAutomaticPlacementFailureCode,
  AttemptAutomaticPlacementResult,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const invalid = (path: readonly string[], message: string) =>
  decode.invalid([{ path, message }]);

const decodeInput = (
  value: unknown,
): DecodeResult<AttemptAutomaticPlacementCommand> => {
  if (!isRecord(value))
    return invalid([], 'Automatic-placement attempt input must be an object.');
  const stringFields = [
    'locationId',
    'productionOrderId',
    'idempotencyKey',
    'actorId',
  ] as const;
  const issues: ContractIssue[] = stringFields.flatMap((field) =>
    nonEmpty(value[field])
      ? []
      : [{ path: [field], message: `${field} must be a non-empty string.` }],
  );
  const action = value['authorizedAction'];
  if (action !== 'production:queue' && action !== 'production:override')
    issues.push({
      path: ['authorizedAction'],
      message: 'authorizedAction must be a supported Production capability.',
    });
  if (issues.length > 0) return decode.invalid(issues);
  return decode.valid({
    locationId: value['locationId'] as string,
    productionOrderId: value['productionOrderId'] as string,
    idempotencyKey: value['idempotencyKey'] as string,
    actorId: value['actorId'] as string,
    authorizedAction: action as 'production:queue' | 'production:override',
  });
};

const outputIssues = (
  values: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: ['output', ...issue.path.map(String)],
    message: issue.message,
  }));

const decodeOutput = (
  value: unknown,
): DecodeResult<AttemptAutomaticPlacementResult> => {
  if (value === null) return decode.valid(null);
  const replayed = isRecord(value) ? value['replayed'] : undefined;
  const normalized =
    isRecord(value) &&
    value['status'] === 'confirmation_required' &&
    typeof replayed === 'boolean'
      ? { ...value, replayed: false }
      : value;
  const parsed =
    automaticProductionOrderPlacementResultSchema.safeParse(normalized);
  if (!parsed.success) return decode.invalid(outputIssues(parsed.error.issues));
  return decode.valid(
    parsed.data.status === 'confirmation_required' &&
      typeof replayed === 'boolean'
      ? { ...parsed.data, replayed }
      : parsed.data,
  );
};

const failureCodes = new Set<AttemptAutomaticPlacementFailureCode>([
  'production_idempotency_conflict',
  'production_order_execution_event_not_allowed',
  'production_order_execution_state_invalid',
  'production_order_execution_transition_invalid',
  'production_placement_context_not_found',
  'production_placement_order_version_conflict',
  'production_placement_queue_version_conflict',
  'production_placement_stage_version_conflict',
]);

const isExpectedFailure = (
  value: unknown,
): value is AttemptAutomaticPlacementExpectedFailure => {
  if (!isRecord(value)) return false;
  return (
    (value['kind'] === 'conflict' || value['kind'] === 'not_found') &&
    typeof value['code'] === 'string' &&
    failureCodes.has(value['code'] as AttemptAutomaticPlacementFailureCode) &&
    typeof value['message'] === 'string' &&
    typeof value['safeMessage'] === 'string'
  );
};

const encodeOutput = (value: AttemptAutomaticPlacementResult): unknown => {
  const parsed = decodeOutput(value);
  if (parsed.kind === 'valid') return value;
  throw invariantViolationError({
    code: 'invalid_cell_success_response',
    message:
      'An automatic-placement attempt result did not satisfy its serialized contract.',
    safeMessage: 'The automatic-placement attempt result is invalid.',
    cause: parsed.issues,
  });
};

export const attemptAutomaticPlacementContract = defineCellContract<
  AttemptAutomaticPlacementCommand,
  AttemptAutomaticPlacementResult,
  AttemptAutomaticPlacementExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({ ...input }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeOutput,
    encode: encodeOutput,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: (value) =>
      isExpectedFailure(value)
        ? decode.valid(value)
        : invalid([], 'Automatic-placement attempt failure is invalid.'),
    encode: (failure) => ({ ...failure }),
  }),
});
