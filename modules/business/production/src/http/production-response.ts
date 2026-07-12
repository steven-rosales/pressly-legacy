import type { Response } from 'express';
import type { AppError } from '@pressly/errors';
import { apiFailure, apiSuccess } from '@pressly/http';
import type { Result } from '@pressly/kernel';

export const sendProductionResult = <T>(
  response: Response,
  value: Result<T, AppError>,
  successStatus = 200,
): void => {
  if (value.tag === 'err') {
    response.status(value.error.status).json(apiFailure(value.error));
    return;
  }

  response.status(successStatus).json(apiSuccess(value.value));
};
