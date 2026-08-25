import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import type {
  ApplyFulfillmentDemandCommand,
  ApplyFulfillmentDemandExpectedFailure,
  ApplyFulfillmentDemandResult,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const allowedKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): ContractIssue[] => {
  const allowed = new Set(keys);
  return Object.keys(value).flatMap((key) =>
    allowed.has(key)
      ? []
      : [{ path: [key], message: 'Unrecognized input field.' }],
  );
};

const invalid = (issues: readonly ContractIssue[]) => decode.invalid(issues);

const stringField = (
  value: Record<string, unknown>,
  field: string,
): ContractIssue[] =>
  typeof value[field] === 'string'
    ? []
    : [{ path: [field], message: `${field} must be a string.` }];

const nullableStringField = (
  value: Record<string, unknown>,
  field: string,
): ContractIssue[] =>
  value[field] === null || typeof value[field] === 'string'
    ? []
    : [{ path: [field], message: `${field} must be a string or null.` }];

const numberField = (
  value: Record<string, unknown>,
  field: string,
): ContractIssue[] =>
  typeof value[field] === 'number'
    ? []
    : [{ path: [field], message: `${field} must be a number.` }];

const nullableNumberField = (
  value: Record<string, unknown>,
  field: string,
): ContractIssue[] =>
  value[field] === null || typeof value[field] === 'number'
    ? []
    : [{ path: [field], message: `${field} must be a number or null.` }];

const inputKeys = [
  'fulfillmentId',
  'fulfillmentVersion',
  'projectionHash',
  'displayReference',
  'locationId',
  'admissionState',
  'commercialState',
  'dueAt',
  'observedAt',
  'estimatedWeightLbs',
  'estimatedWeightSource',
  'idempotencyKey',
] as const;

const decodeInput = (
  serialized: unknown,
): DecodeResult<ApplyFulfillmentDemandCommand> => {
  if (!isRecord(serialized))
    return invalid([
      {
        path: [],
        message: 'The apply-fulfillment-demand input must be an object.',
      },
    ]);

  const issues: ContractIssue[] = [
    ...allowedKeys(serialized, inputKeys),
    ...stringField(serialized, 'fulfillmentId'),
    ...numberField(serialized, 'fulfillmentVersion'),
    ...stringField(serialized, 'projectionHash'),
    ...nullableStringField(serialized, 'displayReference'),
    ...stringField(serialized, 'locationId'),
    ...stringField(serialized, 'dueAt'),
    ...stringField(serialized, 'observedAt'),
    ...nullableNumberField(serialized, 'estimatedWeightLbs'),
    ...stringField(serialized, 'idempotencyKey'),
  ];
  if (
    serialized['admissionState'] !== 'unreleased' &&
    serialized['admissionState'] !== 'released' &&
    serialized['admissionState'] !== 'withdrawn'
  )
    issues.push({
      path: ['admissionState'],
      message: 'admissionState is invalid.',
    });
  if (
    serialized['commercialState'] !== 'open' &&
    serialized['commercialState'] !== 'completed' &&
    serialized['commercialState'] !== 'canceled'
  )
    issues.push({
      path: ['commercialState'],
      message: 'commercialState is invalid.',
    });
  if (
    serialized['estimatedWeightSource'] !== null &&
    serialized['estimatedWeightSource'] !== 'external_estimate'
  )
    issues.push({
      path: ['estimatedWeightSource'],
      message: 'estimatedWeightSource is invalid.',
    });
  if (issues.length > 0) return invalid(issues);

  return decode.valid({
    fulfillmentId: serialized['fulfillmentId'] as string,
    fulfillmentVersion: serialized['fulfillmentVersion'] as number,
    projectionHash: serialized['projectionHash'] as string,
    displayReference: serialized['displayReference'] as string | null,
    locationId: serialized['locationId'] as string,
    admissionState: serialized[
      'admissionState'
    ] as ApplyFulfillmentDemandCommand['admissionState'],
    commercialState: serialized[
      'commercialState'
    ] as ApplyFulfillmentDemandCommand['commercialState'],
    dueAt: serialized['dueAt'] as string,
    observedAt: serialized['observedAt'] as string,
    estimatedWeightLbs: serialized['estimatedWeightLbs'] as number | null,
    estimatedWeightSource: serialized[
      'estimatedWeightSource'
    ] as ApplyFulfillmentDemandCommand['estimatedWeightSource'],
    idempotencyKey: serialized['idempotencyKey'] as string,
  });
};

const encodeInput = (value: ApplyFulfillmentDemandCommand): unknown => ({
  fulfillmentId: value.fulfillmentId,
  fulfillmentVersion: value.fulfillmentVersion,
  projectionHash: value.projectionHash,
  displayReference: value.displayReference,
  locationId: value.locationId,
  admissionState: value.admissionState,
  commercialState: value.commercialState,
  dueAt: value.dueAt,
  observedAt: value.observedAt,
  estimatedWeightLbs: value.estimatedWeightLbs,
  estimatedWeightSource: value.estimatedWeightSource,
  idempotencyKey: value.idempotencyKey,
});

const outputKeys = [
  'orderDemandId',
  'productionOrderId',
  'outcome',
  'replayed',
] as const;

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ApplyFulfillmentDemandResult> => {
  if (!isRecord(serialized))
    return invalid([
      {
        path: [],
        message: 'The apply-fulfillment-demand result must be an object.',
      },
    ]);
  const issues: ContractIssue[] = [
    ...allowedKeys(serialized, outputKeys),
    ...stringField(serialized, 'orderDemandId'),
    ...nullableStringField(serialized, 'productionOrderId'),
  ];
  if (
    serialized['outcome'] !== 'applied' &&
    serialized['outcome'] !== 'ignored_older' &&
    serialized['outcome'] !== 'unchanged'
  )
    issues.push({ path: ['outcome'], message: 'outcome is invalid.' });
  if (typeof serialized['replayed'] !== 'boolean')
    issues.push({ path: ['replayed'], message: 'replayed must be a boolean.' });
  if (issues.length > 0) return invalid(issues);
  return decode.valid({
    orderDemandId: serialized['orderDemandId'] as string,
    productionOrderId: serialized['productionOrderId'] as string | null,
    outcome: serialized['outcome'] as ApplyFulfillmentDemandResult['outcome'],
    replayed: serialized['replayed'] as boolean,
  });
};

const encodeOutput = (value: ApplyFulfillmentDemandResult): unknown => ({
  orderDemandId: value.orderDemandId,
  productionOrderId: value.productionOrderId,
  outcome: value.outcome,
  replayed: value.replayed,
});

const decodeFailure = (
  serialized: unknown,
): DecodeResult<ApplyFulfillmentDemandExpectedFailure> => {
  if (!isRecord(serialized))
    return invalid([
      {
        path: [],
        message: 'The apply-fulfillment-demand failure must be an object.',
      },
    ]);
  const validation = serialized['kind'] === 'validation';
  const issues: ContractIssue[] = [
    ...allowedKeys(
      serialized,
      validation
        ? ['kind', 'classification', 'code', 'message', 'safeMessage']
        : ['kind', 'code', 'message', 'safeMessage'],
    ),
    ...stringField(serialized, 'code'),
    ...stringField(serialized, 'message'),
    ...stringField(serialized, 'safeMessage'),
  ];
  if (
    serialized['kind'] !== 'validation' &&
    serialized['kind'] !== 'not_found' &&
    serialized['kind'] !== 'conflict'
  )
    issues.push({ path: ['kind'], message: 'kind is invalid.' });
  if (
    validation &&
    serialized['classification'] !== 'malformed' &&
    serialized['classification'] !== 'semantic'
  )
    issues.push({
      path: ['classification'],
      message: 'classification is invalid.',
    });
  if (issues.length > 0) return invalid(issues);
  return validation
    ? decode.valid({
        kind: 'validation',
        classification:
          serialized['classification'] === 'malformed'
            ? 'malformed'
            : 'semantic',
        code: serialized['code'] as string,
        message: serialized['message'] as string,
        safeMessage: serialized['safeMessage'] as string,
      })
    : decode.valid({
        kind: serialized['kind'] === 'not_found' ? 'not_found' : 'conflict',
        code: serialized['code'] as string,
        message: serialized['message'] as string,
        safeMessage: serialized['safeMessage'] as string,
      });
};

const encodeFailure = (
  value: ApplyFulfillmentDemandExpectedFailure,
): unknown =>
  value.kind === 'validation'
    ? {
        kind: value.kind,
        classification: value.classification,
        code: value.code,
        message: value.message,
        safeMessage: value.safeMessage,
      }
    : {
        kind: value.kind,
        code: value.code,
        message: value.message,
        safeMessage: value.safeMessage,
      };

export const applyFulfillmentDemandInputContract = defineBoundaryContract({
  version: 2,
  decode: decodeInput,
  encode: encodeInput,
});

export const applyFulfillmentDemandOutputContract = defineBoundaryContract({
  version: 1,
  decode: decodeOutput,
  encode: encodeOutput,
});

export const applyFulfillmentDemandFailureContract = defineBoundaryContract({
  version: 1,
  decode: decodeFailure,
  encode: encodeFailure,
});

export const applyFulfillmentDemandContract = defineCellContract({
  input: applyFulfillmentDemandInputContract,
  output: applyFulfillmentDemandOutputContract,
  failure: applyFulfillmentDemandFailureContract,
});
