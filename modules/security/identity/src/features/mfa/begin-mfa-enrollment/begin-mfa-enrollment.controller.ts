import { catchAsync, sendValidatedApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import { mfaFailureToAppError } from '../../../foundations/adapters/http/mfa-request/mfa-failure.adapter.ts';
import {
  readMfaPrincipal,
  readMfaRequestId,
} from '../../../foundations/adapters/http/mfa-request/mfa-principal.adapter.ts';
import {
  beginMfaEnrollmentContract,
  toMfaEnrollmentResult,
} from './begin-mfa-enrollment.contract.mapper.ts';
import type { BeginMfaEnrollment } from './begin-mfa-enrollment.usecase.ts';

export const makeBeginMfaEnrollmentController = (
  begin: BeginMfaEnrollment,
): RequestHandler =>
  catchAsync(async (_request, response) => {
    const principal = readMfaPrincipal(response);
    const requestId = readMfaRequestId(response);
    const enrollment = await begin({
      identityId: principal.identityId,
      label: principal.label,
      ...(requestId === undefined ? {} : { requestId }),
    });

    sendValidatedApiResult(response, enrollment, {
      schema: beginMfaEnrollmentContract.response,
      present: toMfaEnrollmentResult,
      mapFailure: mfaFailureToAppError,
    });
  });
