import {
  decode,
  defineBoundaryContract,
  defineSubscriptionContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import type {
  ProductionChangeEvent,
  SubscribeProductionChangesFailure,
  SubscribeProductionChangesInput,
  SubscribeProductionChangesReady,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const revisionIssue = (path: readonly string[]): readonly ContractIssue[] => [
  {
    path,
    message: 'Revision must be a non-negative safe integer.',
  },
];

const validRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export const decodeSubscribeProductionChangesInput = (
  serialized: unknown,
): DecodeResult<SubscribeProductionChangesInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The subscription input must be an object.' },
    ]);

  const locationId = serialized['locationId'];
  return typeof locationId === 'string' && locationId.length > 0
    ? decode.valid({ locationId })
    : decode.invalid([
        {
          path: ['locationId'],
          message: 'Location ID must be a non-empty string.',
        },
      ]);
};

const decodeReady = (
  serialized: unknown,
): DecodeResult<SubscribeProductionChangesReady> =>
  isRecord(serialized) && validRevision(serialized['revision'])
    ? decode.valid({ revision: serialized['revision'] })
    : decode.invalid(revisionIssue(['revision']));

const decodeEvent = (
  serialized: unknown,
): DecodeResult<ProductionChangeEvent> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The production change event must be an object.' },
    ]);

  if (serialized['kind'] === 'change')
    return validRevision(serialized['revision'])
      ? decode.valid({ kind: 'change', revision: serialized['revision'] })
      : decode.invalid(revisionIssue(['revision']));

  if (
    serialized['kind'] === 'resync' &&
    serialized['reason'] === 'upstream_reconnected'
  )
    return decode.valid({
      kind: 'resync',
      reason: 'upstream_reconnected',
    });

  return decode.invalid([
    {
      path: ['kind'],
      message: 'The event must be a change or upstream resync.',
    },
  ]);
};

const decodeFailure = (
  serialized: unknown,
): DecodeResult<SubscribeProductionChangesFailure> =>
  isRecord(serialized) &&
  serialized['kind'] === 'not_found' &&
  serialized['code'] === 'production_location_not_found' &&
  typeof serialized['message'] === 'string' &&
  typeof serialized['safeMessage'] === 'string'
    ? decode.valid({
        kind: 'not_found',
        code: 'production_location_not_found',
        message: serialized['message'],
        safeMessage: serialized['safeMessage'],
      })
    : decode.invalid([
        {
          path: [],
          message: 'The subscription failure is invalid.',
        },
      ]);

export const subscribeProductionChangesContract = defineSubscriptionContract<
  SubscribeProductionChangesInput,
  SubscribeProductionChangesReady,
  ProductionChangeEvent,
  SubscribeProductionChangesFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeSubscribeProductionChangesInput,
    encode: (input) => ({ locationId: input.locationId }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeReady,
    encode: (output) => ({ revision: output.revision }),
  }),
  event: defineBoundaryContract({
    version: 1,
    decode: decodeEvent,
    encode: (event) => ({ ...event }),
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: decodeFailure,
    encode: (failure) => ({ ...failure }),
  }),
});
