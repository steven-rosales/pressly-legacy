import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import type {
  ResolveSourceClosedFulfillmentCommand,
  ResolveSourceClosedFulfillmentExpectedFailure,
  ResolveSourceClosedFulfillmentResult,
  SourceClosedFulfillmentReviewReason,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const positiveVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const invalid = (path: readonly string[], message: string) =>
  decode.invalid([{ path, message }]);

const decodeInput = (
  serialized: unknown,
): DecodeResult<ResolveSourceClosedFulfillmentCommand> => {
  if (!isRecord(serialized))
    return invalid(
      [],
      'The resolve-source-closed-fulfillment input must be an object.',
    );

  const fields = [
    'locationId',
    'fulfillmentId',
    'actorId',
    'idempotencyKey',
  ] as const;
  const issues: ContractIssue[] = fields.flatMap((field) =>
    nonEmptyString(serialized[field])
      ? []
      : [{ path: [field], message: `${field} must be a non-empty string.` }],
  );
  if (issues.length > 0) return decode.invalid(issues);

  return decode.valid({
    locationId: serialized['locationId'] as string,
    fulfillmentId: serialized['fulfillmentId'] as string,
    actorId: serialized['actorId'] as string,
    idempotencyKey: serialized['idempotencyKey'] as string,
  });
};

const reviewReasons = new Set<SourceClosedFulfillmentReviewReason>([
  'canonical_order_not_open',
  'fulfillment_not_unreleased',
  'resolution_state_invalid',
  'operational_review_required',
  'operational_participation',
  'concurrent_change',
]);

const commonResultFields = (
  value: Record<string, unknown>,
): value is Record<string, unknown> & {
  locationId: string;
  fulfillmentId: string;
} =>
  nonEmptyString(value['locationId']) && nonEmptyString(value['fulfillmentId']);

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ResolveSourceClosedFulfillmentResult> => {
  if (!isRecord(serialized) || !commonResultFields(serialized))
    return invalid([], 'The source-closed fulfillment result is invalid.');

  if (serialized['outcome'] === 'not_found')
    return decode.valid({
      outcome: 'not_found',
      locationId: serialized.locationId,
      fulfillmentId: serialized.fulfillmentId,
    });

  const productionOrderId = serialized['productionOrderId'];
  const version = serialized['version'];
  if (!nonEmptyString(productionOrderId) || !positiveVersion(version))
    return invalid([], 'The source-closed fulfillment result is invalid.');

  if (serialized['outcome'] === 'already_resolved')
    return decode.valid({
      outcome: 'already_resolved',
      locationId: serialized.locationId,
      fulfillmentId: serialized.fulfillmentId,
      productionOrderId,
      version,
    });
  if (
    serialized['outcome'] === 'review_required' &&
    typeof serialized['reason'] === 'string' &&
    reviewReasons.has(
      serialized['reason'] as SourceClosedFulfillmentReviewReason,
    )
  )
    return decode.valid({
      outcome: 'review_required',
      locationId: serialized.locationId,
      fulfillmentId: serialized.fulfillmentId,
      productionOrderId,
      version,
      reason: serialized['reason'] as SourceClosedFulfillmentReviewReason,
    });
  if (
    serialized['outcome'] === 'resolved' &&
    typeof serialized['replayed'] === 'boolean'
  )
    return decode.valid({
      outcome: 'resolved',
      locationId: serialized.locationId,
      fulfillmentId: serialized.fulfillmentId,
      productionOrderId,
      version,
      replayed: serialized['replayed'],
    });
  return invalid([], 'The source-closed fulfillment result is invalid.');
};

const encodeOutput = (value: ResolveSourceClosedFulfillmentResult): unknown => {
  switch (value.outcome) {
    case 'not_found':
      return {
        outcome: value.outcome,
        locationId: value.locationId,
        fulfillmentId: value.fulfillmentId,
      };
    case 'already_resolved':
      return {
        outcome: value.outcome,
        locationId: value.locationId,
        fulfillmentId: value.fulfillmentId,
        productionOrderId: value.productionOrderId,
        version: value.version,
      };
    case 'review_required':
      return {
        outcome: value.outcome,
        locationId: value.locationId,
        fulfillmentId: value.fulfillmentId,
        productionOrderId: value.productionOrderId,
        version: value.version,
        reason: value.reason,
      };
    case 'resolved':
      return {
        outcome: value.outcome,
        locationId: value.locationId,
        fulfillmentId: value.fulfillmentId,
        productionOrderId: value.productionOrderId,
        version: value.version,
        replayed: value.replayed,
      };
  }
};

export const resolveSourceClosedFulfillmentContract = defineCellContract<
  ResolveSourceClosedFulfillmentCommand,
  ResolveSourceClosedFulfillmentResult,
  ResolveSourceClosedFulfillmentExpectedFailure
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
    decode: () =>
      decode.invalid([
        {
          path: [],
          message: 'Resolve source-closed fulfillment has no expected failure.',
        },
      ]),
    encode: (failure) => failure,
  }),
});
