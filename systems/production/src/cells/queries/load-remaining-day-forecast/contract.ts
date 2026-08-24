import {
  productionRemainingDayForecastParamsSchema,
  productionRemainingDayForecastQuerySchema,
  productionRemainingDayForecastSchema,
  type ProductionRemainingDayForecast,
} from './boundary.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  loadRemainingDayForecastExecutionInvalid,
  loadRemainingDayForecastInvalidServiceDay,
  loadRemainingDayForecastLocationNotFound,
  loadRemainingDayForecastScopeTooLarge,
} from './failures.ts';
import type {
  LoadRemainingDayForecastExpectedFailure,
  LoadRemainingDayForecastInput,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const issues = (
  prefix: 'params' | 'query' | 'output',
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
): DecodeResult<LoadRemainingDayForecastInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      {
        path: [],
        message: 'The load-remaining-day-forecast input must be an object.',
      },
    ]);
  const params = productionRemainingDayForecastParamsSchema.safeParse(
    serialized['params'],
  );
  const query = productionRemainingDayForecastQuerySchema.safeParse(
    serialized['query'],
  );
  const failures = [
    ...(params.success ? [] : issues('params', params.error.issues)),
    ...(query.success ? [] : issues('query', query.error.issues)),
  ];
  if (!params.success || !query.success) return decode.invalid(failures);
  return decode.valid({
    locationId: params.data.locationId,
    serviceDay: query.data.serviceDay,
  });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ProductionRemainingDayForecast> => {
  const parsed = productionRemainingDayForecastSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues('output', parsed.error.issues));
};

const encodeOutput = (value: ProductionRemainingDayForecast): unknown => {
  const parsed = productionRemainingDayForecastSchema.safeParse(value);
  if (!parsed.success)
    throw invariantViolationError({
      code: 'invalid_cell_success_response',
      message:
        'A load-remaining-day-forecast success result did not satisfy its serialized contract.',
      safeMessage: 'The production remaining-day forecast is invalid.',
      cause: parsed.error,
    });
  return parsed.data;
};

const decodeFailure = (
  serialized: unknown,
): DecodeResult<LoadRemainingDayForecastExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    serialized['tag'] !== 'ProductionFailure' ||
    typeof serialized['code'] !== 'string'
  )
    return decode.invalid([
      {
        path: [],
        message: 'The load-remaining-day-forecast failure is invalid.',
      },
    ]);
  if (
    serialized['kind'] === 'not_found' &&
    serialized['code'] === 'production_location_not_found'
  )
    return decode.valid(loadRemainingDayForecastLocationNotFound());
  if (
    serialized['kind'] === 'validation' &&
    serialized['classification'] === 'malformed' &&
    serialized['code'] === 'production_forecast_service_day_invalid'
  )
    return decode.valid(loadRemainingDayForecastInvalidServiceDay());
  if (
    serialized['kind'] === 'conflict' &&
    serialized['code'] === 'production_forecast_scope_too_large'
  )
    return decode.valid(loadRemainingDayForecastScopeTooLarge());
  if (
    serialized['kind'] === 'conflict' &&
    serialized['code'] === 'production_order_execution_state_invalid' &&
    typeof serialized['message'] === 'string'
  )
    return decode.valid(
      loadRemainingDayForecastExecutionInvalid(serialized['message']),
    );
  return decode.invalid([
    {
      path: [],
      message: 'The load-remaining-day-forecast failure is invalid.',
    },
  ]);
};

export const loadRemainingDayForecastContract = defineCellContract<
  LoadRemainingDayForecastInput,
  ProductionRemainingDayForecast,
  LoadRemainingDayForecastExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: { locationId: input.locationId },
      query: { serviceDay: input.serviceDay },
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
