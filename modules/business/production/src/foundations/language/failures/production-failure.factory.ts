import type { JsonValue } from '@pressly/codec';
import type {
  ProductionConflictFailure,
  ProductionFeatureFailure,
  ProductionNotFoundFailure,
  ProductionValidationFailure,
} from './production-feature.failure.ts';

export const isProductionFeatureFailure = (
  value: unknown,
): value is ProductionFeatureFailure =>
  value !== null &&
  typeof value === 'object' &&
  'tag' in value &&
  value.tag === 'ProductionFailure' &&
  'kind' in value &&
  (value.kind === 'validation' ||
    value.kind === 'not_found' ||
    value.kind === 'conflict') &&
  'code' in value &&
  typeof value.code === 'string' &&
  'message' in value &&
  typeof value.message === 'string' &&
  'safeMessage' in value &&
  typeof value.safeMessage === 'string';

type FailureInput = Readonly<{
  code: string;
  message: string;
  safeMessage?: string;
  details?: JsonValue;
  publicDetails?: JsonValue;
}>;

const commonFields = (input: FailureInput, defaultSafeMessage: string) => ({
  code: input.code,
  message: input.message,
  safeMessage: input.safeMessage ?? defaultSafeMessage,
  ...(input.details === undefined ? {} : { details: input.details }),
  ...(input.publicDetails === undefined
    ? {}
    : { publicDetails: input.publicDetails }),
});

export const validationFailure = (
  input: FailureInput &
    Readonly<{
      classification?: ProductionValidationFailure['classification'];
    }>,
): ProductionValidationFailure => ({
  tag: 'ProductionFailure',
  kind: 'validation',
  classification: input.classification ?? 'malformed',
  ...commonFields(input, 'Invalid request input.'),
});

export const notFoundFailure = (
  input: FailureInput,
): ProductionNotFoundFailure => ({
  tag: 'ProductionFailure',
  kind: 'not_found',
  ...commonFields(input, 'The requested resource was not found.'),
});

export const conflictFailure = (
  input: FailureInput,
): ProductionConflictFailure => ({
  tag: 'ProductionFailure',
  kind: 'conflict',
  ...commonFields(input, 'The request conflicts with current state.'),
});

export const defineProductionFailureFactory = () =>
  Object.freeze({
    validation: validationFailure,
    notFound: notFoundFailure,
    conflict: conflictFailure,
  });

export const productionFailure = defineProductionFailureFactory();
