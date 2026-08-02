import type { Response } from 'express';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import { apiSuccess } from '../api-response.js';

export const sendApiResult = <T>(
  response: Response,
  outcome: Result<T, AppError>,
  successStatus = 200,
): void => {
  if (outcome.tag === 'err') throw outcome.error;

  response.status(successStatus).json(apiSuccess(outcome.value));
};
