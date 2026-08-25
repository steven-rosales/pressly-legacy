import type { Response } from 'express';
import type { ZodType } from 'zod';
import {
  isAppError,
  mapUnknownError,
  type AppError,
} from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';
import type { Result } from '@pressly/cells/result';
import { apiSuccess } from '../api-response.js';

type ResponseContract<Value, Output> = Readonly<{
  schema: ZodType<Output>;
  present: (value: Value) => Output;
  successStatus?: number;
}>;

type FailureResponseContract<Value, Output, Failure> = ResponseContract<
  Value,
  Output
> &
  Readonly<{ mapFailure: (failure: Failure) => AppError }>;

const responseContractError = (cause: unknown): AppError =>
  invariantViolationError({
    code: 'invalid_api_success_response',
    message:
      'An application success result did not satisfy its serialized response contract.',
    safeMessage: 'The request could not be completed.',
    cause,
  });

const validatedResponseOutput = <Value, Output>(
  value: Value,
  contract: ResponseContract<Value, Output>,
): Output => {
  try {
    const parsed = contract.schema.safeParse(contract.present(value));

    if (!parsed.success) throw responseContractError(parsed.error);

    return parsed.data;
  } catch (cause) {
    throw mapUnknownError(cause, responseContractError);
  }
};

export const sendApiResult = <T>(
  response: Response,
  outcome: Result<T, AppError>,
  successStatus = 200,
): void => {
  if (outcome.tag === 'err') throw outcome.error;

  response.status(successStatus).json(apiSuccess(outcome.value));
};

export const sendValidatedApiValue = <Value, Output>(
  response: Response,
  value: Value,
  contract: ResponseContract<Value, Output>,
): void => {
  const output = validatedResponseOutput(value, contract);
  response.status(contract.successStatus ?? 200).json(apiSuccess(output));
};

export function sendValidatedApiResult<Value, Output>(
  response: Response,
  outcome: Result<Value, AppError>,
  contract: ResponseContract<Value, Output>,
): void;
export function sendValidatedApiResult<Value, Output, Failure>(
  response: Response,
  outcome: Result<Value, Failure>,
  contract: FailureResponseContract<Value, Output, Failure>,
): void;
export function sendValidatedApiResult<Value, Output, Failure>(
  response: Response,
  outcome: Result<Value, Failure>,
  contract:
    | ResponseContract<Value, Output>
    | FailureResponseContract<Value, Output, Failure>,
): void {
  if (outcome.tag === 'err') {
    if ('mapFailure' in contract) throw contract.mapFailure(outcome.error);

    if (isAppError(outcome.error)) throw outcome.error;

    throw invariantViolationError({
      code: 'unmapped_api_failure',
      message: 'An API result failure reached HTTP without a failure mapper.',
    });
  }

  sendValidatedApiValue(response, outcome.value, contract);
}
