import type { AppError } from '@pressly/errors/app-error';
import {
  authError,
  conflictError,
  permissionError,
  rateLimitError,
} from '@pressly/errors/factories';
import type {
  LoadSessionFailure,
  LoginFailure,
  MfaFailure,
} from '@pressly/identity';

type ProcessorSessionFailure = LoadSessionFailure | LoginFailure | MfaFailure;

export const processorSessionFailureToAppError = (
  failure: ProcessorSessionFailure,
): AppError => {
  const errorInput = {
    code: failure.code,
    message: failure.message,
    safeMessage: failure.message,
  };

  switch (failure.kind) {
    case 'authentication':
      return authError(errorInput);
    case 'rate_limit':
      return rateLimitError(errorInput);
    case 'conflict':
      return conflictError(errorInput);
  }
};

export const processorUnauthorized = (input: {
  code: string;
  message: string;
  safeMessage?: string;
}): AppError =>
  authError({
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage ?? 'Authentication is required.',
  });

export const processorForbidden = (input: {
  code: string;
  message: string;
  safeMessage: string;
}): AppError =>
  permissionError({
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage,
  });
