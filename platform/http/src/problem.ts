import type { AppError, HttpStatusCode } from '@pressly/errors/app-error';
import { apiFailure, type ApiFailure } from './api-response.js';

export type HttpFailure = Readonly<{
  status: HttpStatusCode;
  body: ApiFailure;
}>;

export const httpFailureFromError = (error: AppError): HttpFailure => ({
  status: error.status,
  body: apiFailure(error),
});
