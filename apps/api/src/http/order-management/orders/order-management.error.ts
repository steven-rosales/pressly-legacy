import type { AppError } from '@pressly/errors/app-error';
import {
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import type { CodedFailure, Result } from '@pressly/kernel';

export type OrderManagementFailure = CodedFailure &
  Readonly<{
    kind: 'validation' | 'not_found' | 'conflict';
  }>;

export const orderManagementFailureToAppError = (
  failure: OrderManagementFailure,
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

export const orderManagementResultValue = <
  Value,
  Failure extends OrderManagementFailure,
>(
  outcome: Result<Value, Failure>,
): Value => {
  if (outcome.tag === 'err')
    throw orderManagementFailureToAppError(outcome.error);
  return outcome.value;
};
