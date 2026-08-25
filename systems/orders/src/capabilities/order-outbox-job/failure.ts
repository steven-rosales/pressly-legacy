import type { AppError } from '@pressly/errors/app-error';
import {
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import type { CodedFailure } from '@pressly/cells/result';

export type OrdersWorkerFailure = CodedFailure &
  Readonly<{
    kind: 'validation' | 'not_found' | 'conflict';
  }>;

export const ordersWorkerFailureToAppError = (
  failure: OrdersWorkerFailure,
): AppError => {
  const input = {
    code: failure.code,
    message: failure.message,
    safeMessage: failure.message,
  };
  switch (failure.kind) {
    case 'validation':
      return validationError(input);
    case 'not_found':
      return notFoundError(input);
    case 'conflict':
      return conflictError(input);
  }
};
