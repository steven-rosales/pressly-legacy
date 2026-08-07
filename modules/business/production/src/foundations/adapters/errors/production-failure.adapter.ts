import {
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import type { AppError } from '@pressly/errors/app-error';
import type { ProductionFeatureFailure } from '../../language/failures/production-feature.failure.ts';

const fields = (failure: ProductionFeatureFailure) => ({
  code: failure.code,
  message: failure.message,
  safeMessage: failure.safeMessage,
  ...(failure.details === undefined ? {} : { details: failure.details }),
  ...(failure.publicDetails === undefined
    ? {}
    : { publicDetails: failure.publicDetails }),
});

export const productionFailureToAppError = (
  failure: ProductionFeatureFailure,
): AppError => {
  switch (failure.kind) {
    case 'validation':
      return validationError({
        ...fields(failure),
        status: failure.classification === 'semantic' ? 422 : 400,
      });
    case 'not_found':
      return notFoundError(fields(failure));
    case 'conflict':
      return conflictError(fields(failure));
  }
};
