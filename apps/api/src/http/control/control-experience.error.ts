import type {
  ControlCustomerRejection,
  ControlOrderRejection,
  ControlWorkforceRejection,
} from '@pressly/control-experience';
import {
  authError,
  conflictError,
  notFoundError,
  permissionError,
  rateLimitError,
  validationError,
} from '@pressly/errors/factories';
import type { AppError } from '@pressly/errors/app-error';

type ControlExpectedFailure =
  | ControlCustomerRejection
  | ControlOrderRejection
  | ControlWorkforceRejection
  | Readonly<{
      kind: 'location_not_found';
      requestedLocationId: string;
    }>;

export const controlFailureToAppError = (
  failure: ControlExpectedFailure,
): AppError => {
  if (failure.kind === 'location_not_found')
    return notFoundError({
      code: 'control_location_not_found',
      message: `Requested location ${failure.requestedLocationId} is outside the Control access boundary.`,
      safeMessage: 'The production location was not found.',
    });

  const errorInput = {
    code: failure.code,
    message: `Control peer rejected the request: ${failure.code}.`,
    safeMessage: failure.message,
    ...(failure.details === undefined
      ? {}
      : { publicDetails: failure.details }),
  };

  switch (failure.category) {
    case 'validation':
      return validationError(errorInput);
    case 'authentication':
      return authError(errorInput);
    case 'permission':
      return permissionError(errorInput);
    case 'not_found':
      return notFoundError(errorInput);
    case 'conflict':
      return conflictError(errorInput);
    case 'rate_limit':
      return rateLimitError(errorInput);
  }
};

export const controlResultValue = <Value>(
  outcome:
    | Readonly<{ tag: 'ok'; value: Value }>
    | Readonly<{ tag: 'err'; error: ControlExpectedFailure }>,
): Value => {
  if (outcome.tag === 'err') throw controlFailureToAppError(outcome.error);

  return outcome.value;
};
